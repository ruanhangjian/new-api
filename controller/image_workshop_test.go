package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImageWorkshopTokensReturnsOnlyCurrentUserMaskedTokens(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerUserAndToken(t, 2, 22)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/image-workshop/tokens", nil)
	c.Set("id", 1)

	ListImageWorkshopTokens(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	var resp struct {
		Success bool `json:"success"`
		Data    []struct {
			ID  int    `json:"id"`
			Key string `json:"key"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &resp))
	require.True(t, resp.Success)
	require.Len(t, resp.Data, 1)
	assert.Equal(t, 11, resp.Data[0].ID)
	assert.Equal(t, model.MaskTokenKey("token_11"), resp.Data[0].Key)
	assert.NotContains(t, recorder.Body.String(), "token_11")
	assert.NotContains(t, recorder.Body.String(), "token_22")
}

func TestImageWorkshopOptionsReturnsTokenLimitedImageModels(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerChannel(t, "gpt-image-2,gpt-4o-mini")
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", 11).Updates(map[string]any{
		"model_limits_enabled": true,
		"model_limits":         "gpt-image-2",
	}).Error)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/image-workshop/options?token_id=11", nil)
	c.Set("id", 1)
	GetImageWorkshopOptions(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			TokenID int `json:"token_id"`
			Models  []struct {
				Model              string   `json:"model"`
				Sizes              []string `json:"sizes"`
				SizeTiers          []string `json:"size_tiers"`
				AspectRatios       []string `json:"aspect_ratios"`
				SupportsCustomSize bool     `json:"supports_custom_size"`
				Qualities          []string `json:"qualities"`
				OutputFormats      []string `json:"output_formats"`
				MaxImages          int      `json:"max_images"`
			} `json:"models"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.Equal(t, 11, response.Data.TokenID)
	require.Len(t, response.Data.Models, 1)
	assert.Equal(t, "gpt-image-2", response.Data.Models[0].Model)
	assert.Contains(t, response.Data.Models[0].Sizes, "3840x2160")
	assert.Equal(t, []string{"1K", "2K", "4K"}, response.Data.Models[0].SizeTiers)
	assert.Contains(t, response.Data.Models[0].AspectRatios, "21:9")
	assert.True(t, response.Data.Models[0].SupportsCustomSize)
	assert.Contains(t, response.Data.Models[0].Qualities, "auto")
	assert.Equal(t, []string{"png", "jpeg", "webp"}, response.Data.Models[0].OutputFormats)
	assert.Equal(t, 6, response.Data.Models[0].MaxImages)

	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id = ?", 101).Update("base_url", "https://images.example.com/v1").Error)
	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/image-workshop/options?token_id=11", nil)
	c.Set("id", 1)
	GetImageWorkshopOptions(c)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Data.Models, 1)
	assert.Equal(t, []string{"auto", "low", "medium", "high"}, response.Data.Models[0].Qualities)
	assert.Equal(t, []string{"png", "jpeg", "webp"}, response.Data.Models[0].OutputFormats)
	assert.Equal(t, 6, response.Data.Models[0].MaxImages)
}

func TestImageWorkshopGenerationQueuesGptImage2ThroughCompatibleChannel(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerChannel(t, "gpt-image-2")
	require.NoError(t, db.Model(&model.Channel{}).Where("id = ?", 101).Update("base_url", "https://images.example.com/v1").Error)
	disableImageAsyncControllerBackgroundWork(t)

	body := []byte(`{"token_id":11,"model":"gpt-image-2","prompt":"draw","n":4,"size":"1033x1522","quality":"high","output_format":"webp"}`)
	recorder := performImageWorkshopGenerationRouteRequest(t, 1, body)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":true`)

	var task model.Task
	require.NoError(t, db.Where("user_id = ?", 1).First(&task).Error)
	var data service.ImageAsyncTaskData
	require.NoError(t, task.GetData(&data))
	assert.Contains(t, string(data.Request.Body), `"model":"gpt-image-2"`)
	assert.Contains(t, string(data.Request.Body), `"n":4`)
	assert.Contains(t, string(data.Request.Body), `"size":"1040x1520"`)
	assert.Contains(t, string(data.Request.Body), `"quality":"high"`)
	assert.Contains(t, string(data.Request.Body), `"output_format":"webp"`)
	assert.Equal(t, "1040x1520", data.Metadata["request_size"])
	assert.Equal(t, "2K", data.Metadata["billing_tier"])
	assert.Equal(t, 1.5, data.Metadata["billing_multiplier"])
	assert.Equal(t, "fixed_price_multiplier", data.Metadata["billing_strategy"])
}

func TestImageWorkshopOptionsRejectsDisabledToken(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", 11).Update("status", common.TokenStatusDisabled).Error)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/image-workshop/options?token_id=11", nil)
	c.Set("id", 1)

	GetImageWorkshopOptions(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":false`)
	assert.Contains(t, recorder.Body.String(), "token is disabled")
}

func TestImageWorkshopGenerationRejectsOtherUserToken(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerUserAndToken(t, 2, 22)
	disableImageAsyncControllerBackgroundWork(t)

	recorder := performImageWorkshopGenerationRouteRequest(t, 1, []byte(`{"token_id":22,"model":"gpt-image-1","prompt":"draw"}`))

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":false`)
	var count int64
	require.NoError(t, db.Model(&model.Task{}).Count(&count).Error)
	assert.EqualValues(t, 0, count)
}

func TestImageWorkshopGenerationQueuesOwnedTokenAndStripsTokenID(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerChannel(t, "gpt-image-1")
	disableImageAsyncControllerBackgroundWork(t)

	body := []byte(`{"token_id":11,"model":"gpt-image-1","prompt":"draw","n":1,"size":"1024x1024","quality":"auto","output_format":"PNG","moderation":"low","response_format":"url"}`)
	recorder := performImageWorkshopGenerationRouteRequest(t, 1, body)

	require.Equal(t, http.StatusOK, recorder.Code)
	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			TaskID string `json:"task_id"`
			Status string `json:"status"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &resp))
	require.True(t, resp.Success)
	assert.Equal(t, "queued", resp.Data.Status)
	require.NotEmpty(t, resp.Data.TaskID)

	var task model.Task
	require.NoError(t, db.Where("task_id = ?", resp.Data.TaskID).First(&task).Error)
	assert.EqualValues(t, constant.TaskPlatformImage, task.Platform)
	assert.Equal(t, service.ImageAsyncActionGeneration, task.Action)
	assert.Equal(t, 1, task.UserId)
	assert.Equal(t, 11, task.PrivateData.TokenId)
	assert.Equal(t, "gpt-image-1", task.Properties.OriginModelName)

	var data service.ImageAsyncTaskData
	require.NoError(t, task.GetData(&data))
	assert.NotContains(t, string(data.Request.Body), "token_id")
	assert.NotContains(t, string(task.Data), "token_11")
	assert.Contains(t, string(data.Request.Body), `"response_format":"b64_json"`)
	assert.Contains(t, string(data.Request.Body), `"moderation":"auto"`)
	assert.NotContains(t, string(data.Request.Body), `"moderation":"low"`)
	assert.Contains(t, string(data.Request.Body), `"output_format":"png"`)
	assert.Equal(t, "image_workshop", data.Metadata["source"])
}

func TestImageWorkshopTaskRetryReusesFailedTaskAndForcesSingleImage(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerChannel(t, "gpt-image-1")
	disableImageAsyncControllerBackgroundWork(t)

	task := &model.Task{
		TaskID:     "task_retry_in_place",
		UserId:     1,
		Platform:   constant.TaskPlatformImage,
		Status:     model.TaskStatusFailure,
		Progress:   "100%",
		SubmitTime: time.Now().Add(-time.Minute).Unix(),
		StartTime:  time.Now().Add(-50 * time.Second).Unix(),
		FinishTime: time.Now().Add(-20 * time.Second).Unix(),
		FailReason: "unexpected end of JSON input",
		Action:     service.ImageAsyncActionGeneration,
		Properties: model.Properties{OriginModelName: "gpt-image-1"},
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	}
	task.SetData(service.ImageAsyncTaskData{
		Request: service.ImageAsyncRequest{
			Method:      http.MethodPost,
			Path:        "/v1/images/generations",
			ContentType: "application/json",
			Body:        json.RawMessage(`{"model":"gpt-image-1","prompt":"draw","n":4,"size":"1024x1024","quality":"auto","response_format":"b64_json"}`),
		},
		Result:    json.RawMessage(`{"data":[{"url":"https://example.com/stale.png"}]}`),
		Error:     &service.ImageAsyncTaskError{Message: "unexpected end of JSON input"},
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
		Metadata:  map[string]interface{}{"source": "image_workshop", "request_size": "1024x1024"},
	})
	insertImageAsyncControllerTask(t, task)

	var queuedTaskID string
	imageAsyncTaskRunner = func(taskID string) { queuedTaskID = taskID }
	recorder := performImageWorkshopRetryRouteRequest(t, 1, task.TaskID)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":true`)
	assert.Contains(t, recorder.Body.String(), `"task_id":"task_retry_in_place"`)
	assert.Contains(t, recorder.Body.String(), `"status":"queued"`)
	assert.Equal(t, task.TaskID, queuedTaskID)

	var count int64
	require.NoError(t, db.Model(&model.Task{}).Count(&count).Error)
	assert.EqualValues(t, 1, count)

	var updated model.Task
	require.NoError(t, db.Where("task_id = ?", task.TaskID).First(&updated).Error)
	assert.EqualValues(t, model.TaskStatusQueued, updated.Status)
	assert.Equal(t, "0%", updated.Progress)
	assert.Empty(t, updated.FailReason)
	assert.Zero(t, updated.StartTime)
	assert.Zero(t, updated.FinishTime)
	assert.Equal(t, 11, updated.PrivateData.TokenId)
	var data service.ImageAsyncTaskData
	require.NoError(t, updated.GetData(&data))
	assert.JSONEq(t, `{"model":"gpt-image-1","prompt":"draw","n":1,"size":"1024x1024","quality":"auto","response_format":"b64_json"}`, string(data.Request.Body))
	assert.Empty(t, data.Result)
	assert.Nil(t, data.Error)
	assert.Empty(t, data.Files)
	assert.Zero(t, data.ExpiresAt)
}

func TestImageWorkshopTaskRetryRejectsOtherUserAndNonFailedTask(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerUserAndToken(t, 2, 22)
	seedImageAsyncControllerChannel(t, "gpt-image-1")
	disableImageAsyncControllerBackgroundWork(t)

	task := &model.Task{
		TaskID:      "task_retry_guard",
		UserId:      1,
		Platform:    constant.TaskPlatformImage,
		Status:      model.TaskStatusFailure,
		PrivateData: model.TaskPrivateData{TokenId: 11},
	}
	task.SetData(service.ImageAsyncTaskData{
		Request:  service.ImageAsyncRequest{Body: json.RawMessage(`{"model":"gpt-image-1","prompt":"draw","n":1}`)},
		Metadata: map[string]interface{}{"source": "image_workshop"},
	})
	insertImageAsyncControllerTask(t, task)

	recorder := performImageWorkshopRetryRouteRequest(t, 2, task.TaskID)
	assert.Contains(t, recorder.Body.String(), `"success":false`)
	assert.Contains(t, recorder.Body.String(), "image task not found")

	require.NoError(t, model.DB.Model(&model.Task{}).Where("task_id = ?", task.TaskID).Update("status", model.TaskStatusSuccess).Error)
	recorder = performImageWorkshopRetryRouteRequest(t, 1, task.TaskID)
	assert.Contains(t, recorder.Body.String(), `"success":false`)
	assert.Contains(t, recorder.Body.String(), "only failed image tasks can be retried")
}

func TestImageWorkshopGenerationRejectsUnsupportedFieldsAndParameters(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{name: "unknown field", body: `{"token_id":11,"model":"gpt-image-1","prompt":"draw","style":"vivid"}`, want: "unsupported fields"},
		{name: "invalid count", body: `{"token_id":11,"model":"gpt-image-1","prompt":"draw","n":5}`, want: "n must be between 1 and 4"},
		{name: "invalid quality", body: `{"token_id":11,"model":"gpt-image-1","prompt":"draw","quality":"ultra"}`, want: "quality is not supported"},
		{name: "invalid format", body: `{"token_id":11,"model":"gpt-image-1","prompt":"draw","output_format":"gif"}`, want: "output_format is not supported"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db := setupImageAsyncControllerTestDB(t)
			seedImageAsyncControllerUserAndToken(t, 1, 11)
			seedImageAsyncControllerChannel(t, "gpt-image-1")
			disableImageAsyncControllerBackgroundWork(t)

			recorder := performImageWorkshopGenerationRouteRequest(t, 1, []byte(test.body))

			require.Equal(t, http.StatusOK, recorder.Code)
			assert.Contains(t, recorder.Body.String(), test.want)
			var count int64
			require.NoError(t, db.Model(&model.Task{}).Count(&count).Error)
			assert.Zero(t, count)
		})
	}
}

func TestEnhanceImageWorkshopPromptAddsRatioAndInstruction(t *testing.T) {
	tests := []struct {
		name string
		size string
		want string
	}{
		{
			name: "landscape ratio",
			size: "1536x1024",
			want: "draw\n\n将宽高比设为 3:2\n\n" + imageWorkshopPromptSuffix,
		},
		{
			name: "portrait ratio",
			size: "1024x1536",
			want: "draw\n\n将宽高比设为 2:3\n\n" + imageWorkshopPromptSuffix,
		},
		{
			name: "square only adds default instruction",
			size: "1024x1024",
			want: "draw\n\n" + imageWorkshopPromptSuffix,
		},
		{
			name: "auto only adds default instruction",
			size: "auto",
			want: "draw\n\n" + imageWorkshopPromptSuffix,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.want, enhanceImageWorkshopPrompt("draw", test.size))
		})
	}
}

func TestFinalizeImageWorkshopRequestRemovesModerationForCompatibleUpstream(t *testing.T) {
	tests := []struct {
		name           string
		baseURL        string
		wantModeration bool
	}{
		{name: "official openai", baseURL: "https://api.openai.com", wantModeration: true},
		{name: "compatible upstream", baseURL: "https://images.example.com/v1", wantModeration: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
			require.NoError(t, replaceImageWorkshopRequestBody(c, []byte(`{"model":"gpt-image-1","prompt":"draw","size":"1536x1024","moderation":"auto"}`)))
			common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, test.baseURL)

			require.NoError(t, finalizeImageWorkshopRequestForSelectedChannel(c))
			storage, err := common.GetBodyStorage(c)
			require.NoError(t, err)
			body, err := storage.Bytes()
			require.NoError(t, err)
			if test.wantModeration {
				assert.Contains(t, string(body), `"moderation":"auto"`)
			} else {
				assert.NotContains(t, string(body), "moderation")
			}
			assert.Contains(t, string(body), `将宽高比设为 3:2`)
			assert.Contains(t, string(body), imageWorkshopPromptSuffix)
		})
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	require.NoError(t, replaceImageWorkshopRequestBody(c, []byte(`{"model":"dall-e-3","prompt":"draw","size":"1024x1024","moderation":"auto"}`)))
	common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, "https://api.openai.com")
	require.NoError(t, finalizeImageWorkshopRequestForSelectedChannel(c))
	storage, err := common.GetBodyStorage(c)
	require.NoError(t, err)
	body, err := storage.Bytes()
	require.NoError(t, err)
	assert.NotContains(t, string(body), "moderation")
	assert.NotContains(t, string(body), "将宽高比设为")
	assert.Contains(t, string(body), imageWorkshopPromptSuffix)
}

func TestImageWorkshopGenerationRevalidatesTokenStateBeforeQueueing(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerChannel(t, "gpt-image-1")
	disableImageAsyncControllerBackgroundWork(t)
	require.NoError(t, db.Model(&model.Token{}).Where("id = ?", 11).Update("status", common.TokenStatusDisabled).Error)

	body := []byte(`{"token_id":11,"model":"gpt-image-1","prompt":"draw"}`)
	recorder := performImageWorkshopGenerationRouteRequest(t, 1, body)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	var count int64
	require.NoError(t, db.Model(&model.Task{}).Count(&count).Error)
	assert.EqualValues(t, 0, count)
}

func TestImageWorkshopGenerationRouteAppliesModelRequestRateLimit(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 101, 201)
	seedImageAsyncControllerChannel(t, "gpt-image-1")
	disableImageAsyncControllerBackgroundWork(t)
	restore := enableImageWorkshopModelRequestRateLimit(t, 0, 1)
	defer restore()

	body := []byte(`{"token_id":201,"model":"gpt-image-1","prompt":"draw"}`)
	first := performImageWorkshopGenerationRouteRequest(t, 101, body)
	require.Equal(t, http.StatusOK, first.Code)
	assert.Contains(t, first.Body.String(), `"success":true`)

	second := performImageWorkshopGenerationRouteRequest(t, 101, body)
	require.Equal(t, http.StatusTooManyRequests, second.Code)

	var count int64
	require.NoError(t, db.Model(&model.Task{}).Where("user_id = ?", 101).Count(&count).Error)
	assert.EqualValues(t, 1, count)
}

func TestImageWorkshopTaskRequiresCurrentUserAndImagePlatform(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerUserAndToken(t, 2, 22)
	insertImageAsyncControllerTask(t, &model.Task{
		TaskID:   "task_user_1",
		UserId:   1,
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	})
	insertImageAsyncControllerTask(t, &model.Task{
		TaskID:   "task_other_user",
		UserId:   2,
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			TokenId: 22,
		},
	})
	insertImageAsyncControllerTask(t, &model.Task{
		TaskID:   "task_suno",
		UserId:   1,
		Platform: constant.TaskPlatformSuno,
		Status:   model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	})

	tests := []struct {
		name    string
		taskID  string
		success bool
	}{
		{name: "own image task", taskID: "task_user_1", success: true},
		{name: "other user task", taskID: "task_other_user", success: false},
		{name: "non image task", taskID: "task_suno", success: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodGet, "/api/image-workshop/tasks/"+tt.taskID, nil)
			c.Params = gin.Params{{Key: "task_id", Value: tt.taskID}}
			c.Set("id", 1)

			GetImageWorkshopTask(c)

			require.Equal(t, http.StatusOK, recorder.Code)
			if tt.success {
				assert.Contains(t, recorder.Body.String(), `"success":true`)
				assert.Contains(t, recorder.Body.String(), `"task_id":"`+tt.taskID+`"`)
			} else {
				assert.Contains(t, recorder.Body.String(), `"success":false`)
			}
		})
	}
}

func TestDeleteImageWorkshopTasksOnlyDeletesOwnedTerminalTasks(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	now := time.Now().Unix()
	seedImageAsyncControllerTask := func(taskID string, userID int, platform constant.TaskPlatform, status model.TaskStatus) {
		insertImageAsyncControllerTask(t, &model.Task{
			TaskID:     taskID,
			UserId:     userID,
			Platform:   platform,
			Status:     status,
			SubmitTime: now,
			CreatedAt:  now,
			UpdatedAt:  now,
		})
	}
	seedImageAsyncControllerTask("delete_success", 1, constant.TaskPlatformImage, model.TaskStatusSuccess)
	seedImageAsyncControllerTask("delete_failure", 1, constant.TaskPlatformImage, model.TaskStatusFailure)
	seedImageAsyncControllerTask("keep_running", 1, constant.TaskPlatformImage, model.TaskStatusInProgress)
	seedImageAsyncControllerTask("keep_other_user", 2, constant.TaskPlatformImage, model.TaskStatusSuccess)
	seedImageAsyncControllerTask("keep_other_platform", 1, constant.TaskPlatformSuno, model.TaskStatusSuccess)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(
		http.MethodDelete,
		"/api/image-workshop/tasks",
		bytes.NewBufferString(`{"task_ids":["delete_success","delete_failure","keep_running","keep_other_user","keep_other_platform"]}`),
	)
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", 1)

	DeleteImageWorkshopTasks(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"deleted":2`)
	assert.Contains(t, recorder.Body.String(), `"delete_success"`)
	assert.Contains(t, recorder.Body.String(), `"delete_failure"`)

	var remaining int64
	require.NoError(t, db.Model(&model.Task{}).Count(&remaining).Error)
	assert.EqualValues(t, 3, remaining)
}

func TestDeleteImageWorkshopTasksSupportsDateScopes(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	now := time.Now().Unix()
	insertImageAsyncControllerTask(t, &model.Task{
		TaskID: "delete_old", UserId: 1, Platform: constant.TaskPlatformImage,
		Status: model.TaskStatusSuccess, FinishTime: now - 8*86400,
		SubmitTime: now - 8*86400, CreatedAt: now - 8*86400, UpdatedAt: now - 8*86400,
	})
	insertImageAsyncControllerTask(t, &model.Task{
		TaskID: "delete_recent", UserId: 1, Platform: constant.TaskPlatformImage,
		Status: model.TaskStatusFailure, FinishTime: now - 86400,
		SubmitTime: now - 86400, CreatedAt: now - 86400, UpdatedAt: now - 86400,
	})
	insertImageAsyncControllerTask(t, &model.Task{
		TaskID: "keep_active", UserId: 1, Platform: constant.TaskPlatformImage,
		Status: model.TaskStatusInProgress, SubmitTime: now - 8*86400,
		CreatedAt: now - 8*86400, UpdatedAt: now - 8*86400,
	})

	deleteByScope := func(scope string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest(http.MethodDelete, "/api/image-workshop/tasks?scope="+scope, nil)
		c.Set("id", 1)
		DeleteImageWorkshopTasks(c)
		return recorder
	}

	recorder := deleteByScope("before_7d")
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"deleted":1`)
	assert.Contains(t, recorder.Body.String(), `"delete_old"`)

	recorder = deleteByScope("all")
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"deleted":1`)
	assert.Contains(t, recorder.Body.String(), `"delete_recent"`)

	var remaining int64
	require.NoError(t, db.Model(&model.Task{}).Count(&remaining).Error)
	assert.EqualValues(t, 1, remaining)
}

func TestImageWorkshopTaskReturnsSignedResultURL(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	task := &model.Task{
		TaskID:   "task_signed_result",
		UserId:   1,
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			TokenId: 11,
		},
	}
	task.SetData(service.ImageAsyncTaskData{Result: json.RawMessage(`{"created":1,"data":[{"url":"https://example.com/image.png?expires=` + strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10) + `&signature=test"}]}`)})
	insertImageAsyncControllerTask(t, task)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/image-workshop/tasks/task_signed_result", nil)
	c.Params = gin.Params{{Key: "task_id", Value: "task_signed_result"}}
	c.Set("id", 1)

	GetImageWorkshopTask(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "signature=")
	assert.NotContains(t, recorder.Body.String(), "relative_path")
}

func TestImageWorkshopTaskDoesNotTrustLocalResultWithoutFilesMetadata(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	task := &model.Task{TaskID: "task_missing_files", UserId: 1, Platform: constant.TaskPlatformImage, Status: model.TaskStatusSuccess}
	task.SetData(service.ImageAsyncTaskData{
		Result: json.RawMessage(`{"data":[{"url":"/v1/images/tasks/task_missing_files/files/file_1?expires=9999999999&signature=old"}]}`),
	})
	insertImageAsyncControllerTask(t, task)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/image-workshop/tasks/task_missing_files", nil)
	c.Params = gin.Params{{Key: "task_id", Value: "task_missing_files"}}
	c.Set("id", 1)
	GetImageWorkshopTask(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"result_available":false`)
	assert.NotContains(t, recorder.Body.String(), `"result":`)
}

func TestImageWorkshopTaskListReturnsOnlyOwnedImagesAndRefreshesSignature(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerUserAndToken(t, 2, 22)
	store := &service.ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour}
	imageResultStore = store
	t.Cleanup(func() { imageResultStore = service.NewImageResultStoreFromEnv() })

	rewritten, files, expiresAt, err := store.RewriteB64JSON("task_history", []byte(`{"created":1,"data":[{"b64_json":"`+testTinyPNGBase64+`"}]}`), time.Now())
	require.NoError(t, err)
	task := &model.Task{
		TaskID:     "task_history",
		UserId:     1,
		Platform:   constant.TaskPlatformImage,
		Status:     model.TaskStatusSuccess,
		Progress:   "100%",
		SubmitTime: time.Now().Unix(),
		Properties: model.Properties{OriginModelName: "gpt-image-1"},
	}
	task.SetData(service.ImageAsyncTaskData{
		Request: service.ImageAsyncRequest{Body: json.RawMessage(`{"model":"gpt-image-1","prompt":"draw history","n":1,"size":"1024x1024","quality":"auto","output_format":"png"}`)},
		Result:  json.RawMessage(rewritten), Files: files, ExpiresAt: expiresAt,
		Metadata: map[string]interface{}{
			"source":             "image_workshop",
			"billing_tier":       "1K",
			"billing_multiplier": 1.0,
		},
	})
	insertImageAsyncControllerTask(t, task)
	insertImageAsyncControllerTask(t, &model.Task{TaskID: "other_history", UserId: 2, Platform: constant.TaskPlatformImage, Status: model.TaskStatusSuccess})
	insertImageAsyncControllerTask(t, &model.Task{TaskID: "video_history", UserId: 1, Platform: constant.TaskPlatformSuno, Status: model.TaskStatusSuccess})

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/image-workshop/tasks?page=1&page_size=20", nil)
	c.Set("id", 1)
	ListImageWorkshopTasks(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Total int `json:"total"`
			Items []struct {
				TaskID          string          `json:"task_id"`
				Prompt          string          `json:"prompt"`
				BillingTier     string          `json:"billing_tier"`
				OutputSizes     []string        `json:"output_sizes"`
				ResultAvailable bool            `json:"result_available"`
				Result          json.RawMessage `json:"result"`
			} `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.Equal(t, 1, response.Data.Total)
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, "task_history", response.Data.Items[0].TaskID)
	assert.Equal(t, "draw history", response.Data.Items[0].Prompt)
	assert.Equal(t, "1K", response.Data.Items[0].BillingTier)
	assert.Equal(t, []string{"1x1"}, response.Data.Items[0].OutputSizes)
	assert.True(t, response.Data.Items[0].ResultAvailable)
	assert.Contains(t, string(response.Data.Items[0].Result), "signature=")
	assert.Contains(t, string(response.Data.Items[0].Result), "expires=")
}

func TestImageWorkshopTaskMarksExpiredLocalResultUnavailable(t *testing.T) {
	setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	store := &service.ImageResultStore{RootDir: t.TempDir(), TTL: time.Hour}
	imageResultStore = store
	t.Cleanup(func() { imageResultStore = service.NewImageResultStoreFromEnv() })

	rewritten, files, _, err := store.RewriteB64JSON("task_expired", []byte(`{"data":[{"b64_json":"`+testTinyPNGBase64+`"}]}`), time.Now())
	require.NoError(t, err)
	files[0].ExpiresAt = time.Now().Add(-time.Minute).Unix()
	task := &model.Task{TaskID: "task_expired", UserId: 1, Platform: constant.TaskPlatformImage, Status: model.TaskStatusSuccess}
	task.SetData(service.ImageAsyncTaskData{Result: json.RawMessage(rewritten), Files: files, ExpiresAt: files[0].ExpiresAt})
	insertImageAsyncControllerTask(t, task)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/image-workshop/tasks/task_expired", nil)
	c.Params = gin.Params{{Key: "task_id", Value: "task_expired"}}
	c.Set("id", 1)
	GetImageWorkshopTask(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"result_available":false`)
	assert.NotContains(t, recorder.Body.String(), `"result":`)
}

func performImageWorkshopGenerationRouteRequest(t *testing.T, userID int, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	accessToken := fmt.Sprintf("image-workshop-access-%d", userID)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("access_token", accessToken).Error)

	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("image-workshop-test"))))
	router.Use(middleware.BodyStorageCleanup())
	router.POST(
		"/api/image-workshop/generations",
		middleware.UserAuth(),
		PrepareImageWorkshopGeneration,
		middleware.SystemPerformanceCheck(),
		middleware.TokenAuth(),
		middleware.ModelRequestRateLimit(),
		middleware.Distribute(),
		CreateImageWorkshopGeneration,
	)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/image-workshop/generations", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("New-Api-User", fmt.Sprintf("public_%d", userID))
	router.ServeHTTP(recorder, request)
	return recorder
}

func performImageWorkshopRetryRouteRequest(t *testing.T, userID int, taskID string) *httptest.ResponseRecorder {
	t.Helper()
	accessToken := fmt.Sprintf("image-workshop-access-%d", userID)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("access_token", accessToken).Error)

	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("image-workshop-test"))))
	router.Use(middleware.BodyStorageCleanup())
	router.POST(
		"/api/image-workshop/tasks/:task_id/retry",
		middleware.UserAuth(),
		PrepareImageWorkshopTaskRetry,
		middleware.SystemPerformanceCheck(),
		middleware.TokenAuth(),
		middleware.ModelRequestRateLimit(),
		middleware.Distribute(),
		RetryImageWorkshopTask,
	)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/image-workshop/tasks/"+taskID+"/retry", nil)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("New-Api-User", fmt.Sprintf("public_%d", userID))
	router.ServeHTTP(recorder, request)
	return recorder
}

func enableImageWorkshopModelRequestRateLimit(t *testing.T, totalCount int, successCount int) func() {
	t.Helper()
	originalEnabled := setting.ModelRequestRateLimitEnabled
	originalDuration := setting.ModelRequestRateLimitDurationMinutes
	originalTotal := setting.ModelRequestRateLimitCount
	originalSuccess := setting.ModelRequestRateLimitSuccessCount
	originalGroup := setting.ModelRequestRateLimitGroup

	setting.ModelRequestRateLimitEnabled = true
	setting.ModelRequestRateLimitDurationMinutes = 1
	setting.ModelRequestRateLimitCount = totalCount
	setting.ModelRequestRateLimitSuccessCount = successCount
	setting.ModelRequestRateLimitGroup = map[string][2]int{}

	return func() {
		setting.ModelRequestRateLimitEnabled = originalEnabled
		setting.ModelRequestRateLimitDurationMinutes = originalDuration
		setting.ModelRequestRateLimitCount = originalTotal
		setting.ModelRequestRateLimitSuccessCount = originalSuccess
		setting.ModelRequestRateLimitGroup = originalGroup
	}
}
