package service

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"golang.org/x/sys/unix"
)

const (
	defaultImageResultTTLHours = 6
	maxImageResultTTLHours     = 24
	defaultImageMaxFileMB      = 50
	defaultImageMaxTaskMB      = 200
	defaultImageCacheMaxGB     = 1
	defaultImageMinFreeGB      = 2
)

type ImageAsyncTaskData struct {
	Request   ImageAsyncRequest      `json:"request,omitempty"`
	Result    json.RawMessage        `json:"result,omitempty"`
	Error     *ImageAsyncTaskError   `json:"error,omitempty"`
	Files     []ImageResultFile      `json:"files,omitempty"`
	ExpiresAt int64                  `json:"expires_at,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

type ImageAsyncRequest struct {
	Method      string            `json:"method,omitempty"`
	Path        string            `json:"path,omitempty"`
	Query       string            `json:"query,omitempty"`
	ContentType string            `json:"content_type,omitempty"`
	Body        json.RawMessage   `json:"body,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
}

type ImageAsyncTaskError struct {
	Message string `json:"message"`
}

type ImageResultFile struct {
	FileID       string `json:"file_id"`
	RelativePath string `json:"relative_path"`
	MimeType     string `json:"mime_type"`
	Size         int64  `json:"size"`
	ExpiresAt    int64  `json:"expires_at"`
	URL          string `json:"url"`
}

type ImageResultStore struct {
	mu            sync.RWMutex
	RootDir       string
	TTL           time.Duration
	MaxFileBytes  int64
	MaxTaskBytes  int64
	CacheMaxBytes int64
	MinFreeBytes  int64
}

func NewImageResultStoreFromEnv() *ImageResultStore {
	ttlHours := common.GetEnvOrDefault("IMAGE_WORKSHOP_RESULT_TTL_HOURS", defaultImageResultTTLHours)
	if ttlHours <= 0 {
		ttlHours = defaultImageResultTTLHours
	}
	maxTTL := common.GetEnvOrDefault("IMAGE_WORKSHOP_RESULT_TTL_MAX_HOURS", maxImageResultTTLHours)
	if maxTTL <= 0 {
		maxTTL = maxImageResultTTLHours
	}
	if ttlHours > maxTTL {
		ttlHours = maxTTL
	}
	root := common.GetEnvOrDefaultString("IMAGE_WORKSHOP_ROOT", filepath.Join("data", "image-workshop"))
	return &ImageResultStore{
		RootDir:       root,
		TTL:           time.Duration(ttlHours) * time.Hour,
		MaxFileBytes:  int64(common.GetEnvOrDefault("IMAGE_WORKSHOP_MAX_FILE_MB", defaultImageMaxFileMB)) << 20,
		MaxTaskBytes:  int64(common.GetEnvOrDefault("IMAGE_WORKSHOP_MAX_TASK_MB", defaultImageMaxTaskMB)) << 20,
		CacheMaxBytes: int64(common.GetEnvOrDefault("IMAGE_WORKSHOP_CACHE_MAX_GB", defaultImageCacheMaxGB)) << 30,
		MinFreeBytes:  int64(common.GetEnvOrDefault("IMAGE_WORKSHOP_MIN_FREE_GB", defaultImageMinFreeGB)) << 30,
	}
}

func (s *ImageResultStore) RewriteB64JSON(taskID string, body []byte, now time.Time) ([]byte, []ImageResultFile, int64, error) {
	if s == nil {
		s = NewImageResultStoreFromEnv()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var imageResp dto.ImageResponse
	if err := common.Unmarshal(body, &imageResp); err != nil {
		return nil, nil, 0, err
	}
	expiresAt := now.Add(s.TTL).Unix()
	files := make([]ImageResultFile, 0)
	var taskBytes int64
	for i := range imageResp.Data {
		if strings.TrimSpace(imageResp.Data[i].B64Json) == "" {
			continue
		}
		file, err := s.writeBase64Image(taskID, i, imageResp.Data[i].B64Json, expiresAt, now)
		if err != nil {
			return nil, nil, 0, err
		}
		taskBytes += file.Size
		if s.MaxTaskBytes > 0 && taskBytes > s.MaxTaskBytes {
			return nil, nil, 0, fmt.Errorf("image task result exceeds %d bytes", s.MaxTaskBytes)
		}
		imageResp.Data[i].B64Json = ""
		imageResp.Data[i].Url = file.URL
		files = append(files, file)
	}
	rewritten, err := common.Marshal(imageResp)
	if err != nil {
		return nil, nil, 0, err
	}
	return rewritten, files, expiresAt, nil
}

func (s *ImageResultStore) ResolveTaskFile(task *model.Task, fileID string, now time.Time) (string, string, error) {
	if s == nil {
		s = NewImageResultStoreFromEnv()
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if task == nil {
		return "", "", errors.New("task not found")
	}
	if task.Status != model.TaskStatusSuccess {
		return "", "", fmt.Errorf("task is not completed")
	}
	var data ImageAsyncTaskData
	if err := task.GetData(&data); err != nil {
		return "", "", err
	}
	for _, f := range data.Files {
		if f.FileID != fileID {
			continue
		}
		if f.ExpiresAt > 0 && now.Unix() > f.ExpiresAt {
			return "", "", errors.New("image result expired")
		}
		path, err := s.safePath(f.RelativePath)
		if err != nil {
			return "", "", err
		}
		if _, err := os.Stat(path); err != nil {
			if os.IsNotExist(err) {
				return "", "", errors.New("image file not found")
			}
			return "", "", err
		}
		return path, f.MimeType, nil
	}
	return "", "", errors.New("image file not found")
}

func (s *ImageResultStore) CleanExpired(now time.Time) error {
	if s == nil {
		s = NewImageResultStoreFromEnv()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := filepath.Abs(filepath.Join(s.RootDir, "results"))
	if err != nil {
		return err
	}
	if _, err = os.Stat(root); os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.ModTime().Add(s.TTL).Before(now) {
			return os.Remove(path)
		}
		return nil
	}); err != nil {
		return err
	}
	return s.enforceCacheBudget(root)
}

func (s *ImageResultStore) writeBase64Image(taskID string, index int, value string, expiresAt int64, now time.Time) (ImageResultFile, error) {
	decoded, err := decodeImageBase64(value)
	if err != nil {
		return ImageResultFile{}, err
	}
	mimeType := http.DetectContentType(decoded)
	if !strings.HasPrefix(mimeType, "image/") {
		return ImageResultFile{}, fmt.Errorf("decoded b64_json is not an image: %s", mimeType)
	}
	if s.MaxFileBytes > 0 && int64(len(decoded)) > s.MaxFileBytes {
		return ImageResultFile{}, fmt.Errorf("image result file exceeds %d bytes", s.MaxFileBytes)
	}
	ext := imageExtension(mimeType)
	random, _ := common.GenerateRandomCharsKey(12)
	fileID := fmt.Sprintf("imgfile_%d_%s", index, random)
	rel := filepath.Join("results", now.Format("2006"), now.Format("01"), now.Format("02"), taskID, fileID+ext)
	path, err := s.safePath(rel)
	if err != nil {
		return ImageResultFile{}, err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return ImageResultFile{}, err
	}
	if err = writeImageFileAtomically(path, decoded); err != nil {
		return ImageResultFile{}, err
	}
	return ImageResultFile{
		FileID:       fileID,
		RelativePath: filepath.ToSlash(rel),
		MimeType:     mimeType,
		Size:         int64(len(decoded)),
		ExpiresAt:    expiresAt,
		URL:          fmt.Sprintf("/v1/images/tasks/%s/files/%s", taskID, fileID),
	}, nil
}

func writeImageFileAtomically(path string, data []byte) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".image-workshop-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer func() { _ = os.Remove(temporaryPath) }()
	if err := temporary.Chmod(0o640); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}

func (s *ImageResultStore) safePath(rel string) (string, error) {
	root, err := filepath.Abs(s.RootDir)
	if err != nil {
		return "", err
	}
	target, err := filepath.Abs(filepath.Join(root, rel))
	if err != nil {
		return "", err
	}
	rootWithSep := root + string(os.PathSeparator)
	if target != root && !strings.HasPrefix(target, rootWithSep) {
		return "", errors.New("invalid image result path")
	}
	return target, nil
}

func decodeImageBase64(value string) ([]byte, error) {
	if idx := strings.Index(value, ","); strings.HasPrefix(value, "data:") && idx >= 0 {
		value = value[idx+1:]
	}
	value = strings.TrimSpace(value)
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err == nil {
		return decoded, nil
	}
	return base64.RawStdEncoding.DecodeString(value)
}

func imageExtension(mimeType string) string {
	switch mimeType {
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ".png"
	}
}

type imageCacheFile struct {
	path    string
	size    int64
	modTime time.Time
}

func (s *ImageResultStore) enforceCacheBudget(root string) error {
	files := make([]imageCacheFile, 0)
	var total int64
	if err := filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		total += info.Size()
		files = append(files, imageCacheFile{path: path, size: info.Size(), modTime: info.ModTime()})
		return nil
	}); err != nil {
		return err
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i].modTime.Before(files[j].modTime)
	})
	for _, file := range files {
		overCacheLimit := s.CacheMaxBytes > 0 && total > s.CacheMaxBytes
		underFreeLimit := s.MinFreeBytes > 0 && freeBytes(root) < s.MinFreeBytes
		if !overCacheLimit && !underFreeLimit {
			break
		}
		if err := os.Remove(file.path); err != nil && !os.IsNotExist(err) {
			return err
		}
		total -= file.size
	}
	return nil
}

func freeBytes(path string) int64 {
	var stat unix.Statfs_t
	if err := unix.Statfs(path, &stat); err != nil {
		return 1<<63 - 1
	}
	return int64(stat.Bavail) * int64(stat.Bsize)
}
