package controller

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
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

func TestIsImageAsyncQueryTrueAcceptsSmallSet(t *testing.T) {
	for _, value := range []string{"true", "TRUE", "1", "yes", "on"} {
		t.Run(value, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations?async="+value, nil)
			assert.True(t, isImageAsyncQuery(c))
		})
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations?async=maybe", nil)
	assert.False(t, isImageAsyncQuery(c))
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

func TestImageWorkshopRequestCountAndSingleImageRewrite(t *testing.T) {
	count, err := imageWorkshopRequestCount([]byte(`{"model":"gpt-image-2","prompt":"draw"}`))
	require.NoError(t, err)
	assert.Equal(t, uint(1), count)

	count, err = imageWorkshopRequestCount([]byte(`{"model":"gpt-image-2","prompt":"draw","n":6}`))
	require.NoError(t, err)
	assert.Equal(t, uint(6), count)

	rewritten, err := rewriteImageWorkshopRequestCount([]byte(`{"model":"gpt-image-2","prompt":"draw","n":6}`), 1)
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"gpt-image-2","prompt":"draw","n":1}`, string(rewritten))
}

func TestImageWorkshopRelayRetriesOnceOn502WithStableIdempotencyKeyAndChannel(t *testing.T) {
	task := &model.Task{TaskID: "task_auto_retry"}
	data := service.ImageAsyncTaskData{}
	body := []byte(`{"model":"gpt-image-2","prompt":"draw","n":1}`)
	var keys []string
	var preferredChannels []int
	var slept []time.Duration
	attempts := 0

	result, err := executeImageWorkshopRelayWithRetry(
		task,
		data,
		body,
		2,
		1,
		func(_ *model.Task, _ service.ImageAsyncTaskData, _ []byte, idempotencyKey string, preferredChannelID int) ([]byte, error) {
			attempts++
			keys = append(keys, idempotencyKey)
			preferredChannels = append(preferredChannels, preferredChannelID)
			if attempts == 1 {
				return nil, &imageAsyncRelayError{StatusCode: http.StatusBadGateway, ChannelID: 101, Code: string(types.ErrorCodeBadResponseStatusCode)}
			}
			return []byte(`{"data":[{"b64_json":"ok"}]}`), nil
		},
		func(delay time.Duration) { slept = append(slept, delay) },
		func() time.Duration { return 1500 * time.Millisecond },
	)

	require.NoError(t, err)
	assert.JSONEq(t, `{"data":[{"b64_json":"ok"}]}`, string(result))
	assert.Equal(t, 2, attempts)
	assert.Equal(t, []string{"image-workshop:task_auto_retry:2", "image-workshop:task_auto_retry:2"}, keys)
	assert.Equal(t, []int{0, 101}, preferredChannels)
	assert.Equal(t, []time.Duration{1500 * time.Millisecond}, slept)
}

func TestImageWorkshopRelayDoesNotRetryAmbiguousOrNonRetryableFailures(t *testing.T) {
	tests := []struct {
		name       string
		relayError *imageAsyncRelayError
	}{
		{name: "gateway timeout", relayError: &imageAsyncRelayError{StatusCode: http.StatusGatewayTimeout}},
		{name: "cloudflare timeout", relayError: &imageAsyncRelayError{StatusCode: 524}},
		{name: "bad request", relayError: &imageAsyncRelayError{StatusCode: http.StatusBadRequest}},
		{name: "malformed success", relayError: &imageAsyncRelayError{StatusCode: http.StatusOK, Code: string(types.ErrorCodeBadResponseBody)}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			attempts := 0
			_, err := executeImageWorkshopRelayWithRetry(
				&model.Task{TaskID: "task_no_retry"},
				service.ImageAsyncTaskData{},
				nil,
				0,
				1,
				func(_ *model.Task, _ service.ImageAsyncTaskData, _ []byte, _ string, _ int) ([]byte, error) {
					attempts++
					return nil, test.relayError
				},
				func(time.Duration) { t.Fatal("non-retryable failure must not sleep") },
				func() time.Duration { return 0 },
			)
			require.Error(t, err)
			assert.Equal(t, 1, attempts)
		})
	}
}

func TestImageWorkshopRelayRetriesExplicitConnectionFailure(t *testing.T) {
	relayErr := &imageAsyncRelayError{StatusCode: http.StatusInternalServerError, Code: string(types.ErrorCodeDoRequestFailed)}
	assert.True(t, relayErr.Retryable())
	assert.True(t, (&imageAsyncRelayError{StatusCode: http.StatusBadGateway}).Retryable())
	assert.True(t, (&imageAsyncRelayError{StatusCode: http.StatusServiceUnavailable}).Retryable())
	assert.False(t, (&imageAsyncRelayError{StatusCode: http.StatusGatewayTimeout}).Retryable())
}

func TestImageWorkshopRelayRetriesEmpty502ThroughRealRelay(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	service.InitHttpClient()
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerChannel(t, "gpt-image-1")
	originalModelPrices := ratio_setting.ModelPrice2JSONString()
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"gpt-image-1":0.08}`))
	t.Cleanup(func() {
		_ = ratio_setting.UpdateModelPriceByJSONString(originalModelPrices)
	})

	var attempts atomic.Int32
	idempotencyKeys := make(chan string, 2)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		idempotencyKeys <- request.Header.Get("Idempotency-Key")
		if attempts.Add(1) == 1 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"aW1hZ2U="}],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}`))
	}))
	defer upstream.Close()
	require.NoError(t, db.Model(&model.Channel{}).Where("id = ?", 101).Update("base_url", upstream.URL).Error)

	task := &model.Task{
		TaskID:   "task_real_502_retry",
		UserId:   1,
		Group:    "default",
		Platform: constant.TaskPlatformImage,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	}
	data := service.ImageAsyncTaskData{
		Request: service.ImageAsyncRequest{
			Method:      http.MethodPost,
			Path:        "/v1/images/generations",
			ContentType: "application/json",
			Body:        json.RawMessage(`{"model":"gpt-image-1","prompt":"draw","n":1,"size":"1024x1024","quality":"auto","response_format":"b64_json"}`),
		},
		Metadata: map[string]interface{}{"source": "image_workshop"},
	}

	result, err := executeImageWorkshopRelayWithRetry(
		task,
		data,
		data.Request.Body,
		0,
		1,
		executeImageAsyncRelayAttempt,
		func(time.Duration) {},
		func() time.Duration { return 0 },
	)

	require.NoError(t, err)
	assert.Contains(t, string(result), `"b64_json":"aW1hZ2U="`)
	assert.EqualValues(t, 2, attempts.Load())
	close(idempotencyKeys)
	for key := range idempotencyKeys {
		assert.Equal(t, "image-workshop:task_real_502_retry:0", key)
	}
}

func TestNewImageAsyncRelayErrorPreservesStatusCodeAndChannel(t *testing.T) {
	recorder := httptest.NewRecorder()
	recorder.Code = http.StatusBadGateway
	recorder.Body.WriteString(`{"error":{"message":"Upstream request failed","type":"upstream_error","code":"bad_response_status_code"}}`)
	c, _ := gin.CreateTestContext(recorder)
	c.Set(string(constant.ContextKeyChannelId), 101)

	err := newImageAsyncRelayError(c, recorder)
	var relayErr *imageAsyncRelayError
	require.ErrorAs(t, err, &relayErr)
	assert.Equal(t, http.StatusBadGateway, relayErr.StatusCode)
	assert.Equal(t, 101, relayErr.ChannelID)
	assert.Equal(t, "bad_response_status_code", relayErr.Code)
	assert.Equal(t, "Upstream request failed", relayErr.Message)
}

func TestImageAsyncTaskMetadataCapturesWorkshopBillingTier(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Set(string(constant.ContextKeyImageWorkshopRequest), true)

	metadata := imageAsyncTaskMetadata(c, &dto.ImageRequest{Size: "2304x3456"})

	assert.Equal(t, "image_workshop", metadata["source"])
	assert.Equal(t, "2304x3456", metadata["request_size"])
	assert.Equal(t, "4K", metadata["billing_tier"])
	assert.Equal(t, 2.0, metadata["billing_multiplier"])
	assert.Equal(t, "fixed_price_multiplier", metadata["billing_strategy"])
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
	var user model.User
	require.NoError(t, db.Select("quota").Where("id = ?", 1).First(&user).Error)
	assert.Equal(t, 100000, user.Quota)
	var token model.Token
	require.NoError(t, db.Select("remain_quota", "used_quota").Where("id = ?", 11).First(&token).Error)
	assert.Equal(t, 100000, token.RemainQuota)
	assert.Equal(t, 0, token.UsedQuota)

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
	seedImageAsyncControllerToken(t, 1, 12)
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
	c.Request.Header.Set("Authorization", "Bearer sk-token_11")
	c.Params = gin.Params{{Key: "task_id", Value: "task_file"}, {Key: "file_id", Value: files[0].FileID}}
	GetImageTaskFile(c)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "image/png", recorder.Header().Get("Content-Type"))

	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/images/tasks/task_file/files/"+files[0].FileID, nil)
	c.Request.Header.Set("Authorization", "Bearer sk-token_12")
	c.Params = gin.Params{{Key: "task_id", Value: "task_file"}, {Key: "file_id", Value: files[0].FileID}}
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
	c.Request.Header.Set("Authorization", "Bearer sk-token_11")
	c.Params = gin.Params{{Key: "task_id", Value: "task_file"}, {Key: "file_id", Value: files[0].FileID}}
	GetImageTaskFile(c)
	assert.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestGetImageTaskFileWithSignedURL(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	store := &service.ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour}
	imageResultStore = store
	t.Cleanup(func() { imageResultStore = service.NewImageResultStoreFromEnv() })

	rewritten, files, expiresAt, err := store.RewriteB64JSON("task_signed", []byte(`{"data":[{"b64_json":"`+testTinyPNGBase64+`"}]}`), time.Now())
	require.NoError(t, err)
	task := &model.Task{
		TaskID:   "task_signed",
		UserId:   1,
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	}
	task.SetData(service.ImageAsyncTaskData{Result: json.RawMessage(rewritten), Files: files, ExpiresAt: expiresAt})
	insertImageAsyncControllerTask(t, task)

	signedURL := buildImageTaskFileSignedURL(task, files[0], time.Now().Add(time.Minute))
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, signedURL, nil)
	c.Params = gin.Params{{Key: "task_id", Value: task.TaskID}, {Key: "file_id", Value: files[0].FileID}}
	GetImageTaskFile(c)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "image/png", recorder.Header().Get("Content-Type"))

	expiredURL := buildImageTaskFileSignedURL(task, files[0], time.Now().Add(-time.Minute))
	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, expiredURL, nil)
	c.Params = gin.Params{{Key: "task_id", Value: task.TaskID}, {Key: "file_id", Value: files[0].FileID}}
	GetImageTaskFile(c)
	assert.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestSignImageTaskResultURLsRewritesLocalFileURL(t *testing.T) {
	task := &model.Task{
		TaskID: "task_result",
		UserId: 1,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	}
	file := service.ImageResultFile{
		FileID:    "imgfile_0_test",
		URL:       "/v1/images/tasks/task_result/files/imgfile_0_test",
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	}
	result := []byte(`{"created":1,"data":[{"url":"/v1/images/tasks/task_result/files/imgfile_0_test"}]}`)

	rewritten, files, err := signImageTaskResultURLs(task, result, []service.ImageResultFile{file}, time.Now())
	require.NoError(t, err)
	assert.Contains(t, string(rewritten), "signature=")
	assert.Contains(t, string(rewritten), "expires=")
	require.Len(t, files, 1)
	assert.Contains(t, files[0].URL, "signature=")
}

func TestBuildAsyncImageRelayContextRejectsInvalidTokenStateAndModelLimit(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	task := &model.Task{
		TaskID:   "task_auth",
		UserId:   1,
		Group:    "default",
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusQueued,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	}
	data := service.ImageAsyncTaskData{Request: service.ImageAsyncRequest{
		Method:      http.MethodPost,
		Path:        "/v1/images/generations",
		ContentType: "application/json",
		Body:        json.RawMessage(`{"model":"gpt-image-1","prompt":"draw"}`),
	}}

	invalidTokenCases := []struct {
		name    string
		updates map[string]any
	}{
		{name: "disabled", updates: map[string]any{"status": common.TokenStatusDisabled}},
		{name: "expired", updates: map[string]any{"status": common.TokenStatusEnabled, "expired_time": time.Now().Add(-time.Minute).Unix()}},
		{name: "exhausted", updates: map[string]any{"status": common.TokenStatusEnabled, "expired_time": int64(-1), "remain_quota": 0}},
	}
	for _, tc := range invalidTokenCases {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", 11).Updates(tc.updates).Error)
			_, _, err := buildAsyncImageRelayContext(task, data)
			require.Error(t, err)
		})
	}

	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", 11).Updates(map[string]any{
		"status":               common.TokenStatusEnabled,
		"expired_time":         int64(-1),
		"remain_quota":         100000,
		"model_limits_enabled": true,
		"model_limits":         "gpt-4o-mini",
	}).Error)
	_, recorder, err := buildAsyncImageRelayContext(task, data)
	require.NoError(t, err)
	require.NotNil(t, recorder)
	assert.NotEqual(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "gpt-image-1")
}

func TestBuildAsyncImageRelayContextUsesIdempotencyKeyAndPreferredChannel(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerChannel(t, "gpt-image-1")
	task := &model.Task{
		TaskID:   "task_preferred_channel",
		UserId:   1,
		Group:    "default",
		Platform: constant.TaskPlatformImage,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	}
	data := service.ImageAsyncTaskData{
		Request: service.ImageAsyncRequest{
			Method:      http.MethodPost,
			Path:        "/v1/images/generations",
			ContentType: "application/json",
			Body:        json.RawMessage(`{"model":"gpt-image-1","prompt":"draw"}`),
		},
		Metadata: map[string]interface{}{"source": "image_workshop"},
	}

	c, recorder, err := buildAsyncImageRelayContextForChannel(task, data, "image-workshop:task_preferred_channel:0", 101)
	require.NoError(t, err)
	require.NotNil(t, c)
	assert.False(t, c.IsAborted(), recorder.Body.String())
	assert.Equal(t, "image-workshop:task_preferred_channel:0", c.Request.Header.Get("Idempotency-Key"))
	assert.Equal(t, 101, common.GetContextKeyInt(c, constant.ContextKeyChannelId))
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

func TestImageWorkshopFailureMessageHidesTruncatedUpstreamJSONError(t *testing.T) {
	assert.Equal(t, "上游服务暂时不可用，请稍后重试", imageWorkshopFailureMessage("unexpected end of JSON input"))
	assert.Equal(t, "上游服务暂时不可用，请稍后重试", imageWorkshopFailureMessage("Upstream request failed"))
	assert.Equal(t, service.ImageTaskTimeoutMessage, imageWorkshopFailureMessage("context deadline exceeded"))
	assert.Equal(t, "quota exceeded", imageWorkshopFailureMessage(" quota exceeded "))
}

const testTinyPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

func setupImageAsyncControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	initImageAsyncControllerColumnNames(t)
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	originalMainDatabaseType := common.MainDatabaseType()
	originalLogDatabaseType := common.LogDatabaseType()
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.MemoryCacheEnabled = false
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(
		&model.Task{},
		&model.User{},
		&model.Token{},
		&model.Channel{},
		&model.Ability{},
		&model.UserSubscription{},
	))
	t.Cleanup(func() {
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func initImageAsyncControllerColumnNames(t *testing.T) {
	t.Helper()
	originalIsMasterNode := common.IsMasterNode
	originalSQLitePath := common.SQLitePath
	originalMainDatabaseType := common.MainDatabaseType()
	originalLogDatabaseType := common.LogDatabaseType()
	originalSQLDSN, hadSQLDSN := os.LookupEnv("SQL_DSN")
	defer func() {
		common.IsMasterNode = originalIsMasterNode
		common.SQLitePath = originalSQLitePath
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		if hadSQLDSN {
			require.NoError(t, os.Setenv("SQL_DSN", originalSQLDSN))
		} else {
			require.NoError(t, os.Unsetenv("SQL_DSN"))
		}
	}()

	common.IsMasterNode = false
	common.SQLitePath = fmt.Sprintf("file:%s_init?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, os.Setenv("SQL_DSN", "local"))
	require.NoError(t, model.InitDB())
	if model.DB != nil {
		sqlDB, err := model.DB.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}
}

func seedImageAsyncControllerUserAndToken(t *testing.T, userID int, tokenID int) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		PublicId: fmt.Sprintf("public_%d", userID),
		Username: fmt.Sprintf("user_%d", userID),
		Role:     common.RoleCommonUser,
		AffCode:  fmt.Sprintf("aff_%d", userID),
		Group:    "default",
		Quota:    100000,
		Status:   common.UserStatusEnabled,
	}).Error)
	seedImageAsyncControllerToken(t, userID, tokenID)
}

func seedImageAsyncControllerToken(t *testing.T, userID int, tokenID int) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.Token{
		Id:          tokenID,
		UserId:      userID,
		Key:         fmt.Sprintf("token_%d", tokenID),
		Name:        "test-token",
		Status:      common.TokenStatusEnabled,
		RemainQuota: 100000,
	}).Error)
}

func seedImageAsyncControllerChannel(t *testing.T, modelName string) {
	t.Helper()
	priority := int64(1)
	weight := uint(1)
	channel := &model.Channel{
		Id:       101,
		Type:     constant.ChannelTypeOpenAI,
		Key:      "sk-test-channel",
		Status:   common.ChannelStatusEnabled,
		Name:     "image-test-channel",
		Models:   modelName,
		Group:    "default",
		Priority: &priority,
		Weight:   &weight,
	}
	require.NoError(t, model.DB.Create(channel).Error)
	require.NoError(t, channel.AddAbilities(nil))
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
