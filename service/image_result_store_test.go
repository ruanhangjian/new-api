package service

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const tinyPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

func TestImageResultStoreRewriteB64JSONWritesFileAndRemovesBase64(t *testing.T) {
	store := &ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour}
	body := []byte(`{"created":123,"data":[{"b64_json":"` + tinyPNGBase64 + `","revised_prompt":"ok"}]}`)

	rewritten, files, expiresAt, err := store.RewriteB64JSON("task_img", body, time.Unix(1000, 0))
	require.NoError(t, err)
	require.Len(t, files, 1)
	assert.NotZero(t, expiresAt)
	assert.NotContains(t, string(rewritten), tinyPNGBase64)
	assert.Contains(t, string(rewritten), "/v1/images/tasks/task_img/files/")

	path, err := store.safePath(files[0].RelativePath)
	require.NoError(t, err)
	_, err = os.Stat(path)
	require.NoError(t, err)
	assert.Equal(t, "image/png", files[0].MimeType)
}

func TestImageResultStoreResolveTaskFileRequiresCompletedTaskAndTTL(t *testing.T) {
	store := &ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour}
	rewritten, files, expiresAt, err := store.RewriteB64JSON("task_img", []byte(`{"data":[{"b64_json":"`+tinyPNGBase64+`"}]}`), time.Unix(1000, 0))
	require.NoError(t, err)

	task := &model.Task{
		TaskID:   "task_img",
		Status:   model.TaskStatusSuccess,
		Platform: constant.TaskPlatformImage,
	}
	task.SetData(ImageAsyncTaskData{
		Result:    json.RawMessage(rewritten),
		Files:     files,
		ExpiresAt: expiresAt,
	})

	path, mimeType, err := store.ResolveTaskFile(task, files[0].FileID, time.Unix(1100, 0))
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(path, filepath.Clean(store.RootDir)))
	assert.Equal(t, "image/png", mimeType)

	_, _, err = store.ResolveTaskFile(task, files[0].FileID, time.Unix(expiresAt+1, 0))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "expired")

	task.Status = model.TaskStatusInProgress
	_, _, err = store.ResolveTaskFile(task, files[0].FileID, time.Unix(1100, 0))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not completed")
}

func TestImageResultStoreCleanExpiredRemovesOldFiles(t *testing.T) {
	store := &ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour}
	_, files, _, err := store.RewriteB64JSON("task_img", []byte(`{"data":[{"b64_json":"`+tinyPNGBase64+`"}]}`), time.Now().Add(-2*time.Hour))
	require.NoError(t, err)
	path, err := store.safePath(files[0].RelativePath)
	require.NoError(t, err)
	old := time.Now().Add(-2 * time.Hour)
	require.NoError(t, os.Chtimes(path, old, old))

	require.NoError(t, store.CleanExpired(time.Now()))
	_, err = os.Stat(path)
	require.True(t, os.IsNotExist(err))
}

func TestImageResultStoreCleanExpiredEnforcesCacheMax(t *testing.T) {
	store := &ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour, CacheMaxBytes: 1, MinFreeBytes: 0}
	_, files, _, err := store.RewriteB64JSON("task_img", []byte(`{"data":[{"b64_json":"`+tinyPNGBase64+`"}]}`), time.Now())
	require.NoError(t, err)
	path, err := store.safePath(files[0].RelativePath)
	require.NoError(t, err)

	require.NoError(t, store.CleanExpired(time.Now()))
	_, err = os.Stat(path)
	require.True(t, os.IsNotExist(err))
}

func TestImageResultStoreRewriteB64JSONRejectsOversizedFile(t *testing.T) {
	store := &ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour, MaxFileBytes: 1}
	_, _, _, err := store.RewriteB64JSON("task_img", []byte(`{"data":[{"b64_json":"`+tinyPNGBase64+`"}]}`), time.Now())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "exceeds")
}

func TestBuildImageTaskPollResponseCompletedAndFailed(t *testing.T) {
	completed := &model.Task{TaskID: "task_done", Status: model.TaskStatusSuccess}
	completed.SetData(ImageAsyncTaskData{Result: json.RawMessage(`{"created":1,"data":[{"url":"/v1/images/tasks/task_done/files/imgfile_0"}]}`)})
	resp, err := BuildImageTaskPollResponse(completed)
	require.NoError(t, err)
	assert.Equal(t, "task_done", resp.Data.TaskID)
	assert.Equal(t, "completed", resp.Data.Status)
	assert.Contains(t, string(resp.Data.Result), `"url"`)

	failed := &model.Task{TaskID: "task_failed", Status: model.TaskStatusFailure, FailReason: "upstream failed"}
	failed.SetData(ImageAsyncTaskData{Error: &ImageAsyncTaskError{Message: "clear failure"}})
	resp, err = BuildImageTaskPollResponse(failed)
	require.NoError(t, err)
	assert.Equal(t, "failed", resp.Data.Status)
	require.NotNil(t, resp.Data.Error)
	assert.Equal(t, "clear failure", resp.Data.Error.Message)
}

func TestGetOwnedImageTaskRejectsDifferentToken(t *testing.T) {
	truncate(t)
	seedUser(t, 10, 1000)
	seedToken(t, 20, 10, "token-a", 1000)
	seedToken(t, 21, 10, "token-b", 1000)

	task := &model.Task{
		TaskID:   "task_img_owned",
		UserId:   10,
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusQueued,
		PrivateData: model.TaskPrivateData{
			TokenId: 20,
		},
	}
	require.NoError(t, model.DB.Create(task).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("id", 10)
	c.Set("token_id", 21)
	_, exists, err := GetOwnedImageTask(c, "task_img_owned")
	require.NoError(t, err)
	assert.False(t, exists)

	c.Set("token_id", 20)
	owned, exists, err := GetOwnedImageTask(c, "task_img_owned")
	require.NoError(t, err)
	require.True(t, exists)
	assert.Equal(t, "task_img_owned", owned.TaskID)
}
