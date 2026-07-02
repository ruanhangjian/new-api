package controller

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRemoveAsyncQueryOnlyRemovesAsyncFlag(t *testing.T) {
	assert.Equal(t, "foo=bar&n=2", removeAsyncQuery("async=true&foo=bar&n=2"))
	assert.Equal(t, "", removeAsyncQuery("async=true"))
	assert.Equal(t, "foo=bar", removeAsyncQuery("foo=bar"))
}

func TestSanitizeImageAsyncHeadersDropsCredentials(t *testing.T) {
	headers := sanitizeImageAsyncHeaders(map[string]string{
		"Authorization": "Bearer sk-secret",
		"X-Api-Key":     "sk-secret",
		"Cookie":        "session=secret",
		"Content-Type":  "application/json",
	})
	assert.Equal(t, map[string]string{"Content-Type": "application/json"}, headers)
}

func TestSubmitAsyncImageGenerationQueuesTask(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	disableImageAsyncControllerBackgroundWork(t)

	body := []byte(`{"model":"gpt-image-1","prompt":"draw a test image","response_format":"url"}`)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations?async=true&foo=bar", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", 1)
	c.Set("token_id", 11)
	c.Set("token_key", "token-a")
	common.SetContextKey(c, constant.ContextKeyUserId, 1)
	common.SetContextKey(c, constant.ContextKeyTokenId, 11)
	common.SetContextKey(c, constant.ContextKeyTokenKey, "token-a")
	common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
	common.SetContextKey(c, constant.ContextKeyUserGroup, "default")

	SubmitAsyncImageGeneration(c)

	require.Equal(t, http.StatusAccepted, recorder.Code)
	var resp struct {
		Data struct {
			TaskID string `json:"task_id"`
			Status string `json:"status"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(t, "queued", resp.Data.Status)
	require.NotEmpty(t, resp.Data.TaskID)

	var task model.Task
	require.NoError(t, db.Where("task_id = ?", resp.Data.TaskID).First(&task).Error)
	assert.EqualValues(t, constant.TaskPlatformImage, task.Platform)
	assert.Equal(t, service.ImageAsyncActionGeneration, task.Action)
	assert.Equal(t, 1, task.UserId)
	assert.Equal(t, 11, task.PrivateData.TokenId)

	var data service.ImageAsyncTaskData
	require.NoError(t, task.GetData(&data))
	assert.Equal(t, "foo=bar", data.Request.Query)
	assert.NotContains(t, string(task.Data), "async=true")
	assert.NotContains(t, string(task.Data), "token-a")
}

func TestPollImageTaskHandlerPermissions(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerUserAndToken(t, 2, 22)
	insertImageAsyncControllerTask(t, &model.Task{
		TaskID:   "task_ok",
		UserId:   1,
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	})
	insertImageAsyncControllerTask(t, &model.Task{
		TaskID:   "task_non_image",
		UserId:   1,
		Platform: constant.TaskPlatformSuno,
		Status:   model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	})

	tests := []struct {
		name       string
		userID     int
		tokenID    int
		taskID     string
		wantStatus int
	}{
		{name: "matching token", userID: 1, tokenID: 11, taskID: "task_ok", wantStatus: http.StatusOK},
		{name: "wrong token", userID: 1, tokenID: 12, taskID: "task_ok", wantStatus: http.StatusNotFound},
		{name: "wrong user", userID: 2, tokenID: 22, taskID: "task_ok", wantStatus: http.StatusNotFound},
		{name: "non image task", userID: 1, tokenID: 11, taskID: "task_non_image", wantStatus: http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodGet, "/v1/images/tasks/"+tt.taskID, nil)
			c.Params = gin.Params{{Key: "task_id", Value: tt.taskID}}
			c.Set("id", tt.userID)
			c.Set("token_id", tt.tokenID)
			PollImageTask(c)
			assert.Equal(t, tt.wantStatus, recorder.Code)
		})
	}
}

func TestGetImageTaskFileHandlerPermissionsAndTTL(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	store := &service.ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour}
	imageResultStore = store
	t.Cleanup(func() { imageResultStore = service.NewImageResultStoreFromEnv() })

	rewritten, files, expiresAt, err := store.RewriteB64JSON("task_file", []byte(`{"data":[{"b64_json":"`+testTinyPNGBase64+`"}]}`), time.Now())
	require.NoError(t, err)
	task := &model.Task{
		TaskID:   "task_file",
		UserId:   1,
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	}
	task.SetData(service.ImageAsyncTaskData{
		Result:    json.RawMessage(rewritten),
		Files:     files,
		ExpiresAt: expiresAt,
	})
	insertImageAsyncControllerTask(t, task)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/images/tasks/task_file/files/"+files[0].FileID, nil)
	c.Params = gin.Params{{Key: "task_id", Value: "task_file"}, {Key: "file_id", Value: files[0].FileID}}
	c.Set("id", 1)
	c.Set("token_id", 11)
	GetImageTaskFile(c)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "image/png", recorder.Header().Get("Content-Type"))

	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/images/tasks/task_file/files/"+files[0].FileID, nil)
	c.Params = gin.Params{{Key: "task_id", Value: "task_file"}, {Key: "file_id", Value: files[0].FileID}}
	c.Set("id", 1)
	c.Set("token_id", 12)
	GetImageTaskFile(c)
	assert.Equal(t, http.StatusNotFound, recorder.Code)

	var reloaded model.Task
	require.NoError(t, model.DB.Where("task_id = ?", "task_file").First(&reloaded).Error)
	var data service.ImageAsyncTaskData
	require.NoError(t, reloaded.GetData(&data))
	data.Files[0].ExpiresAt = time.Now().Add(-time.Minute).Unix()
	reloaded.SetData(data)
	require.NoError(t, model.DB.Save(&reloaded).Error)

	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/images/tasks/task_file/files/"+files[0].FileID, nil)
	c.Params = gin.Params{{Key: "task_id", Value: "task_file"}, {Key: "file_id", Value: files[0].FileID}}
	c.Set("id", 1)
	c.Set("token_id", 11)
	GetImageTaskFile(c)
	assert.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestImageTaskDataDoesNotPersistLargeBase64(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	raw := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, bytes.Repeat([]byte{1, 2, 3, 4}, 1024)...)
	payload := base64.StdEncoding.EncodeToString(raw)
	store := &service.ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour}
	rewritten, files, expiresAt, err := store.RewriteB64JSON("task_large", []byte(`{"data":[{"b64_json":"`+payload+`"}]}`), time.Now())
	require.NoError(t, err)
	task := &model.Task{TaskID: "task_large", UserId: 1, Platform: constant.TaskPlatformImage, Status: model.TaskStatusSuccess}
	task.SetData(service.ImageAsyncTaskData{Result: json.RawMessage(rewritten), Files: files, ExpiresAt: expiresAt})
	require.NoError(t, db.Create(task).Error)

	var reloaded model.Task
	require.NoError(t, db.Where("task_id = ?", "task_large").First(&reloaded).Error)
	assert.NotContains(t, string(reloaded.Data), payload)
	assert.Less(t, len(reloaded.Data), len(payload))
}

const testTinyPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

func setupImageAsyncControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)
	common.UsingSQLite = true
	common.RedisEnabled = false
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(&model.Task{}, &model.User{}, &model.Token{}))
	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func seedImageAsyncControllerUserAndToken(t *testing.T, userID int, tokenID int) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		PublicId: fmt.Sprintf("public_%d", userID),
		Username: fmt.Sprintf("user_%d", userID),
		AffCode:  fmt.Sprintf("aff_%d", userID),
		Group:    "default",
		Quota:    100000,
		Status:   common.UserStatusEnabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		Id:          tokenID,
		UserId:      userID,
		Key:         fmt.Sprintf("token_%d", tokenID),
		Name:        "test-token",
		Status:      common.TokenStatusEnabled,
		RemainQuota: 100000,
	}).Error)
}

func disableImageAsyncControllerBackgroundWork(t *testing.T) {
	t.Helper()
	originalMaintenance := imageAsyncMaintenanceRunner
	originalTaskRunner := imageAsyncTaskRunner
	imageAsyncMaintenanceRunner = func() {}
	imageAsyncTaskRunner = func(string) {}
	t.Cleanup(func() {
		imageAsyncMaintenanceRunner = originalMaintenance
		imageAsyncTaskRunner = originalTaskRunner
	})
}

func insertImageAsyncControllerTask(t *testing.T, task *model.Task) {
	t.Helper()
	now := time.Now().Unix()
	task.CreatedAt = now
	task.UpdatedAt = now
	if len(task.Data) == 0 {
		task.SetData(service.ImageAsyncTaskData{Result: json.RawMessage(`{"created":1,"data":[{"url":"https://example.com/image.png"}]}`)})
	}
	require.NoError(t, model.DB.Create(task).Error)
}
