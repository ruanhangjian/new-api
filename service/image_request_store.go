package service

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	defaultImageReferenceTTLHours = 1
	maxImageReferenceTTLHours     = 24
	defaultImageReferenceTotalMB  = 100
)

type ImageRequestStore struct {
	mu           sync.RWMutex
	RootDir      string
	TTL          time.Duration
	MaxBodyBytes int64
}

func NewImageRequestStoreFromEnv() *ImageRequestStore {
	ttlHours := common.GetEnvOrDefault("IMAGE_WORKSHOP_REFERENCE_TTL_HOURS", defaultImageReferenceTTLHours)
	if ttlHours <= 0 {
		ttlHours = defaultImageReferenceTTLHours
	}
	if ttlHours > maxImageReferenceTTLHours {
		ttlHours = maxImageReferenceTTLHours
	}
	maxTotalMB := common.GetEnvOrDefault("IMAGE_WORKSHOP_REFERENCE_MAX_TOTAL_MB", defaultImageReferenceTotalMB)
	if maxTotalMB <= 0 {
		maxTotalMB = defaultImageReferenceTotalMB
	}
	root := common.GetEnvOrDefaultString("IMAGE_WORKSHOP_ROOT", filepath.Join("data", "image-workshop"))
	return &ImageRequestStore{
		RootDir:      root,
		TTL:          time.Duration(ttlHours) * time.Hour,
		MaxBodyBytes: int64(maxTotalMB) << 20,
	}
}

func (s *ImageRequestStore) Stage(taskID string, reader io.ReadSeeker) (string, int64, error) {
	if s == nil {
		s = NewImageRequestStoreFromEnv()
	}
	if !validImageRequestTaskID(taskID) {
		return "", 0, errors.New("invalid image task id")
	}
	if reader == nil {
		return "", 0, errors.New("image request body is required")
	}
	if _, err := reader.Seek(0, io.SeekStart); err != nil {
		return "", 0, err
	}
	maxBodyBytes := s.MaxBodyBytes
	if maxBodyBytes <= 0 {
		maxBodyBytes = int64(defaultImageReferenceTotalMB) << 20
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	relativePath := filepath.Join("inputs", taskID, "request.multipart")
	path, err := s.safePath(relativePath)
	if err != nil {
		return "", 0, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", 0, err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".request-*")
	if err != nil {
		return "", 0, err
	}
	temporaryPath := temporary.Name()
	defer func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return "", 0, err
	}
	written, err := io.Copy(temporary, io.LimitReader(reader, maxBodyBytes+1))
	if err != nil {
		return "", 0, err
	}
	if written > maxBodyBytes {
		return "", 0, fmt.Errorf("reference image request exceeds %d bytes", maxBodyBytes)
	}
	if err := temporary.Close(); err != nil {
		return "", 0, err
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return "", 0, err
	}
	return filepath.ToSlash(relativePath), written, nil
}

func (s *ImageRequestStore) Open(relativePath string) (*os.File, error) {
	if s == nil {
		s = NewImageRequestStoreFromEnv()
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	path, err := s.safePath(relativePath)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

func (s *ImageRequestStore) Remove(relativePath string) error {
	if s == nil || strings.TrimSpace(relativePath) == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	path, err := s.safePath(relativePath)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	_ = os.Remove(filepath.Dir(path))
	return nil
}

func (s *ImageRequestStore) RemoveTask(taskID string) error {
	if s == nil || !validImageRequestTaskID(taskID) {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	path, err := s.safePath(filepath.Join("inputs", taskID))
	if err != nil {
		return err
	}
	return os.RemoveAll(path)
}

func (s *ImageRequestStore) CleanExpired(now time.Time) error {
	if s == nil {
		s = NewImageRequestStoreFromEnv()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	root, err := s.safePath("inputs")
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Add(s.TTL).Before(now) {
			_ = os.RemoveAll(filepath.Join(root, entry.Name()))
		}
	}
	return nil
}

func (s *ImageRequestStore) safePath(relativePath string) (string, error) {
	root, err := filepath.Abs(s.RootDir)
	if err != nil {
		return "", err
	}
	target, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(relativePath)))
	if err != nil {
		return "", err
	}
	if target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) {
		return "", errors.New("invalid image request path")
	}
	return target, nil
}

func validImageRequestTaskID(taskID string) bool {
	if taskID == "" || len(taskID) > 128 {
		return false
	}
	for _, char := range taskID {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') || char == '-' || char == '_' {
			continue
		}
		return false
	}
	return true
}
