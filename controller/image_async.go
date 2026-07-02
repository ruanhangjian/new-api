package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

var (
	imageResultStore            = service.NewImageResultStoreFromEnv()
	imageAsyncMaintenanceRunner = func() {
		go func() {
			_ = imageResultStore.CleanExpired(time.Now())
			if constant.TaskTimeoutMinutes > 0 {
				service.MarkStaleImageTasksFailed(time.Duration(constant.TaskTimeoutMinutes)*time.Minute, 100)
			}
		}()
	}
	imageAsyncTaskRunner = func(taskID string) {
		go executeAsyncImageTask(taskID)
	}
)

func ImageGenerations(c *gin.Context) {
	if !strings.EqualFold(c.Query("async"), "true") {
		Relay(c, types.RelayFormatOpenAIImage)
		return
	}
	SubmitAsyncImageGeneration(c)
}

func SubmitAsyncImageGeneration(c *gin.Context) {
	imageAsyncMaintenanceRunner()

	bodyStorage, err := common.GetBodyStorage(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": err.Error(), "type": "invalid_request_error"}})
		return
	}
	body, err := bodyStorage.Bytes()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": err.Error(), "type": "invalid_request_error"}})
		return
	}
	request, err := helper.GetAndValidateRequest(c, types.RelayFormatOpenAIImage)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": err.Error(), "type": "invalid_request_error"}})
		return
	}
	imageReq, _ := request.(*dto.ImageRequest)
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAIImage, request, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "server_error"}})
		return
	}

	now := time.Now().Unix()
	task := &model.Task{
		CreatedAt:  now,
		UpdatedAt:  now,
		TaskID:     model.GenerateTaskID(),
		Platform:   constant.TaskPlatformImage,
		UserId:     relayInfo.UserId,
		Group:      relayInfo.UsingGroup,
		ChannelId:  common.GetContextKeyInt(c, constant.ContextKeyChannelId),
		Status:     model.TaskStatusQueued,
		Progress:   "0%",
		SubmitTime: now,
		Action:     service.ImageAsyncActionGeneration,
		Properties: model.Properties{
			OriginModelName: imageReq.Model,
		},
		PrivateData: model.TaskPrivateData{
			TokenId: relayInfo.TokenId,
		},
	}
	task.SetData(service.ImageAsyncTaskData{
		Request: service.ImageAsyncRequest{
			Method:      http.MethodPost,
			Path:        "/v1/images/generations",
			Query:       removeAsyncQuery(c.Request.URL.RawQuery),
			ContentType: c.GetHeader("Content-Type"),
			Body:        json.RawMessage(body),
			Headers:     sanitizeImageAsyncHeaders(relayInfo.RequestHeaders),
		},
	})
	if err = task.Insert(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "server_error"}})
		return
	}

	imageAsyncTaskRunner(task.TaskID)

	c.JSON(http.StatusAccepted, gin.H{
		"data": gin.H{
			"task_id": task.TaskID,
			"status":  "queued",
		},
	})
}

func PollImageTask(c *gin.Context) {
	task, exists, err := service.GetOwnedImageTask(c, c.Param("task_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "server_error"}})
		return
	}
	if !exists {
		service.WriteImageTaskNotFound(c)
		return
	}
	resp, err := service.BuildImageTaskPollResponse(task)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "server_error"}})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func GetImageTaskFile(c *gin.Context) {
	task, exists, err := service.GetOwnedImageTask(c, c.Param("task_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "server_error"}})
		return
	}
	if !exists {
		service.WriteImageTaskNotFound(c)
		return
	}
	path, mimeType, err := imageResultStore.ResolveTaskFile(task, c.Param("file_id"), time.Now())
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": err.Error(), "type": "invalid_request_error"}})
		return
	}
	c.Header("Content-Type", mimeType)
	c.File(path)
}

func executeAsyncImageTask(taskID string) {
	task, exists, err := model.GetByOnlyTaskId(taskID)
	if err != nil || !exists || !service.IsImageAsyncTask(task) {
		return
	}
	task.Status = model.TaskStatusInProgress
	task.Progress = "10%"
	task.StartTime = time.Now().Unix()
	if won, err := task.UpdateWithStatus(model.TaskStatusQueued); err != nil || !won {
		return
	}
	if err := executeAsyncImageTaskOnce(taskID); err != nil {
		failAsyncImageTask(taskID, err.Error())
	}
}

func executeAsyncImageTaskOnce(taskID string) error {
	task, exists, err := model.GetByOnlyTaskId(taskID)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("task not found")
	}
	var data service.ImageAsyncTaskData
	if err = task.GetData(&data); err != nil {
		return err
	}
	c, recorder, err := buildAsyncImageRelayContext(task, data)
	if err != nil {
		return err
	}
	middleware.Distribute()(c)
	if c.IsAborted() {
		return fmt.Errorf("%s", strings.TrimSpace(recorder.Body.String()))
	}
	Relay(c, types.RelayFormatOpenAIImage)
	statusCode := recorder.Code
	if statusCode == 0 {
		statusCode = http.StatusOK
	}
	if statusCode >= http.StatusBadRequest {
		return fmt.Errorf("%s", strings.TrimSpace(recorder.Body.String()))
	}
	resultBody := recorder.Body.Bytes()
	rewritten, files, expiresAt, err := imageResultStore.RewriteB64JSON(task.TaskID, resultBody, time.Now())
	if err != nil {
		return err
	}
	data.Result = json.RawMessage(rewritten)
	data.Files = files
	data.ExpiresAt = expiresAt
	data.Error = nil
	task.SetData(data)
	task.Status = model.TaskStatusSuccess
	task.Progress = "100%"
	task.FinishTime = time.Now().Unix()
	task.UpdatedAt = task.FinishTime
	_, err = task.UpdateWithStatus(model.TaskStatusInProgress)
	return err
}

func buildAsyncImageRelayContext(task *model.Task, data service.ImageAsyncTaskData) (*gin.Context, *httptest.ResponseRecorder, error) {
	token, err := model.GetTokenByIds(task.PrivateData.TokenId, task.UserId)
	if err != nil {
		return nil, nil, err
	}
	userCache, err := model.GetUserCache(task.UserId)
	if err != nil {
		return nil, nil, err
	}
	rawURL := data.Request.Path
	if data.Request.Query != "" {
		rawURL += "?" + data.Request.Query
	}
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return nil, nil, err
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(data.Request.Method, parsedURL.String(), bytes.NewReader(data.Request.Body))
	req.Header.Set("Content-Type", data.Request.ContentType)
	for key, value := range data.Request.Headers {
		if strings.EqualFold(key, "Authorization") {
			continue
		}
		req.Header.Set(key, value)
	}
	c.Request = req
	userCache.WriteContext(c)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, task.Group)
	if err = middleware.SetupContextForToken(c, token); err != nil {
		return nil, nil, err
	}
	return c, recorder, nil
}

func failAsyncImageTask(taskID string, message string) {
	task, exists, err := model.GetByOnlyTaskId(taskID)
	if err != nil || !exists {
		return
	}
	logger.LogWarn(nil, fmt.Sprintf("image async task %s failed: %s", taskID, message))
	var data service.ImageAsyncTaskData
	_ = task.GetData(&data)
	data.Error = &service.ImageAsyncTaskError{Message: message}
	task.SetData(data)
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"
	task.FailReason = message
	task.FinishTime = time.Now().Unix()
	task.UpdatedAt = task.FinishTime
	_, _ = task.UpdateWithStatus(model.TaskStatusInProgress)
}

func removeAsyncQuery(rawQuery string) string {
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return ""
	}
	values.Del("async")
	return values.Encode()
}

func sanitizeImageAsyncHeaders(headers map[string]string) map[string]string {
	if len(headers) == 0 {
		return nil
	}
	safe := make(map[string]string, len(headers))
	for key, value := range headers {
		switch strings.ToLower(key) {
		case "authorization", "x-api-key", "x-goog-api-key", "cookie", "set-cookie":
			continue
		default:
			safe[key] = value
		}
	}
	if len(safe) == 0 {
		return nil
	}
	return safe
}
