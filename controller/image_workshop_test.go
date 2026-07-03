package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
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

func TestImageWorkshopGenerationRejectsOtherUserToken(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerUserAndToken(t, 2, 22)
	disableImageAsyncControllerBackgroundWork(t)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	body := []byte(`{"token_id":22,"model":"gpt-image-1","prompt":"draw"}`)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/image-workshop/generations", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", 1)

	CreateImageWorkshopGeneration(c)

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

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	body := []byte(`{"token_id":11,"model":"gpt-image-1","prompt":"draw","n":1,"size":"1024x1024","quality":"auto","response_format":"url"}`)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/image-workshop/generations", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", 1)

	CreateImageWorkshopGeneration(c)

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
}

func TestImageWorkshopGenerationRevalidatesTokenStateBeforeQueueing(t *testing.T) {
	db := setupImageAsyncControllerTestDB(t)
	seedImageAsyncControllerUserAndToken(t, 1, 11)
	seedImageAsyncControllerChannel(t, "gpt-image-1")
	disableImageAsyncControllerBackgroundWork(t)
	require.NoError(t, db.Model(&model.Token{}).Where("id = ?", 11).Update("status", common.TokenStatusDisabled).Error)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	body := []byte(`{"token_id":11,"model":"gpt-image-1","prompt":"draw"}`)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/image-workshop/generations", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", 1)

	CreateImageWorkshopGeneration(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":false`)
	var count int64
	require.NoError(t, db.Model(&model.Task{}).Count(&count).Error)
	assert.EqualValues(t, 0, count)
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
	task.SetData(service.ImageAsyncTaskData{
		Result: json.RawMessage(`{"created":1,"data":[{"url":"/v1/images/tasks/task_signed_result/files/imgfile_0_test?expires=` + strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10) + `&signature=test"}]}`),
	})
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
