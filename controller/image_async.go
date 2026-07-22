package controller

import (
	"bytes"
	"crypto/hmac"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
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
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

var (
	imageResultStore            = service.NewImageResultStoreFromEnv()
	imageAsyncMaintenanceMu     sync.Mutex
	imageAsyncResultLifecycleMu sync.RWMutex
	imageAsyncMaintenanceRunner = func() {
		go runImageAsyncMaintenance(time.Now())
	}
	imageAsyncTaskRunner = func(taskID string) {
		go executeAsyncImageTask(taskID)
	}
)

func StartImageWorkshopMaintenanceTask() {
	go func() {
		runImageAsyncMaintenance(time.Now())
		minutes := common.GetEnvOrDefault("IMAGE_WORKSHOP_MAINTENANCE_INTERVAL_MINUTES", 10)
		if minutes <= 0 {
			minutes = 10
		}
		ticker := time.NewTicker(time.Duration(minutes) * time.Minute)
		defer ticker.Stop()
		for now := range ticker.C {
			runImageAsyncMaintenance(now)
		}
	}()
}

func runImageAsyncMaintenance(now time.Time) {
	if !imageAsyncMaintenanceMu.TryLock() {
		return
	}
	defer imageAsyncMaintenanceMu.Unlock()
	imageAsyncResultLifecycleMu.Lock()
	defer imageAsyncResultLifecycleMu.Unlock()
	if constant.TaskTimeoutMinutes > 0 {
		service.MarkStaleImageTasksFailed(time.Duration(constant.TaskTimeoutMinutes)*time.Minute, 100)
	}
	if _, err := service.CleanupImageTaskRecords(now); err != nil {
		logger.LogError(nil, fmt.Sprintf("cleanup image workshop task records failed: %v", err))
	}
	if err := imageResultStore.CleanExpired(now); err != nil {
		logger.LogError(nil, fmt.Sprintf("cleanup image workshop result files failed: %v", err))
	}
}

func ImageGenerations(c *gin.Context) {
	if !isImageAsyncQuery(c) {
		Relay(c, types.RelayFormatOpenAIImage)
		return
	}
	SubmitAsyncImageGeneration(c)
}

func SubmitAsyncImageGeneration(c *gin.Context) {
	task, err := enqueueAsyncImageGeneration(c)
	if err != nil {
		c.JSON(err.StatusCode, gin.H{"error": gin.H{"message": err.Message, "type": err.Type}})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"data": gin.H{
			"task_id": task.TaskID,
			"status":  "queued",
		},
	})
}

type imageAsyncSubmitError struct {
	StatusCode int
	Message    string
	Type       string
}

func newImageAsyncSubmitError(statusCode int, message string, errorType string) *imageAsyncSubmitError {
	if errorType == "" {
		errorType = "server_error"
	}
	return &imageAsyncSubmitError{StatusCode: statusCode, Message: message, Type: errorType}
}

func (e *imageAsyncSubmitError) Error() string {
	return e.Message
}

func enqueueAsyncImageGeneration(c *gin.Context) (*model.Task, *imageAsyncSubmitError) {
	imageAsyncMaintenanceRunner()

	bodyStorage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, newImageAsyncSubmitError(http.StatusBadRequest, err.Error(), "invalid_request_error")
	}
	body, err := bodyStorage.Bytes()
	if err != nil {
		return nil, newImageAsyncSubmitError(http.StatusBadRequest, err.Error(), "invalid_request_error")
	}
	request, err := helper.GetAndValidateRequest(c, types.RelayFormatOpenAIImage)
	if err != nil {
		return nil, newImageAsyncSubmitError(http.StatusBadRequest, err.Error(), "invalid_request_error")
	}
	imageReq, _ := request.(*dto.ImageRequest)
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAIImage, request, nil)
	if err != nil {
		return nil, newImageAsyncSubmitError(http.StatusInternalServerError, err.Error(), "server_error")
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
		Metadata: imageAsyncTaskMetadata(c, imageReq),
	})
	if err = task.Insert(); err != nil {
		return nil, newImageAsyncSubmitError(http.StatusInternalServerError, err.Error(), "server_error")
	}

	imageAsyncTaskRunner(task.TaskID)

	return task, nil
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
	if hasImageTaskFileSignature(c) {
		getImageTaskFileBySignature(c)
		return
	}

	middleware.TokenAuth()(c)
	if c.IsAborted() {
		return
	}

	task, exists, err := service.GetOwnedImageTask(c, c.Param("task_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": err.Error(), "type": "server_error"}})
		return
	}
	if !exists {
		service.WriteImageTaskNotFound(c)
		return
	}
	serveImageTaskFile(c, task)
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
	var resultBody []byte
	if isImageWorkshopTask(data) {
		imageCount, err := imageWorkshopRequestCount(data.Request.Body)
		if err != nil {
			return err
		}
		if imageCount > 1 {
			resultBody, err = executeImageWorkshopBatch(task, data, imageCount)
		} else {
			resultBody, err = executeImageAsyncRelay(task, data, data.Request.Body)
		}
	} else {
		resultBody, err = executeImageAsyncRelay(task, data, data.Request.Body)
	}
	if err != nil {
		return err
	}
	imageAsyncResultLifecycleMu.RLock()
	defer imageAsyncResultLifecycleMu.RUnlock()
	rewritten, files, expiresAt, err := imageResultStore.RewriteB64JSON(task.TaskID, resultBody, time.Now())
	if err != nil {
		return err
	}
	rewritten, files, err = signImageTaskResultURLs(task, rewritten, files, time.Now())
	if err != nil {
		return err
	}
	data.Result = json.RawMessage(rewritten)
	data.Files = files
	data.ExpiresAt = expiresAt
	data.Error = nil
	if isImageWorkshopTask(data) {
		requestSize := ""
		billingTier := ""
		if data.Metadata != nil {
			requestSize, _ = data.Metadata["request_size"].(string)
			billingTier, _ = data.Metadata["billing_tier"].(string)
		}
		outputSizes := make([]string, 0, len(files))
		for _, file := range files {
			if file.Width > 0 && file.Height > 0 {
				outputSizes = append(outputSizes, fmt.Sprintf("%dx%d", file.Width, file.Height))
			}
		}
		logger.LogInfo(nil, fmt.Sprintf("image workshop task %s completed: request_size=%s billing_tier=%s output_sizes=%s", task.TaskID, requestSize, billingTier, strings.Join(outputSizes, ",")))
	}
	task.SetData(data)
	task.Status = model.TaskStatusSuccess
	task.Progress = "100%"
	task.FinishTime = time.Now().Unix()
	task.UpdatedAt = task.FinishTime
	_, err = task.UpdateWithStatus(model.TaskStatusInProgress)
	return err
}

func isImageWorkshopTask(data service.ImageAsyncTaskData) bool {
	return data.Metadata != nil && data.Metadata["source"] == "image_workshop"
}

func imageWorkshopRequestCount(body []byte) (uint, error) {
	var request struct {
		N *uint `json:"n,omitempty"`
	}
	if err := common.Unmarshal(body, &request); err != nil {
		return 0, err
	}
	if request.N == nil || *request.N == 0 {
		return 1, nil
	}
	return *request.N, nil
}

func rewriteImageWorkshopRequestCount(body []byte, count uint) ([]byte, error) {
	var payload map[string]json.RawMessage
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	encodedCount, err := common.Marshal(count)
	if err != nil {
		return nil, err
	}
	payload["n"] = encodedCount
	return common.Marshal(payload)
}

func executeImageAsyncRelay(task *model.Task, data service.ImageAsyncTaskData, body []byte) ([]byte, error) {
	relayData := data
	relayData.Request.Body = json.RawMessage(body)
	c, recorder, err := buildAsyncImageRelayContext(task, relayData)
	if err != nil {
		return nil, err
	}
	if c.IsAborted() {
		return nil, fmt.Errorf("%s", strings.TrimSpace(recorder.Body.String()))
	}
	if isImageWorkshopTask(data) {
		if err := finalizeImageWorkshopRequestForSelectedChannel(c); err != nil {
			return nil, err
		}
	}
	Relay(c, types.RelayFormatOpenAIImage)
	statusCode := recorder.Code
	if statusCode == 0 {
		statusCode = http.StatusOK
	}
	if statusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("%s", strings.TrimSpace(recorder.Body.String()))
	}
	return append([]byte(nil), recorder.Body.Bytes()...), nil
}

func executeImageWorkshopBatch(task *model.Task, data service.ImageAsyncTaskData, count uint) ([]byte, error) {
	type batchResult struct {
		index int
		body  []byte
		err   error
	}
	results := make(chan batchResult, count)
	var waitGroup sync.WaitGroup
	for index := 0; index < int(count); index++ {
		waitGroup.Add(1)
		go func(index int) {
			defer waitGroup.Done()
			body, err := rewriteImageWorkshopRequestCount(data.Request.Body, 1)
			if err != nil {
				results <- batchResult{index: index, err: err}
				return
			}
			body, err = executeImageAsyncRelay(task, data, body)
			results <- batchResult{index: index, body: body, err: err}
		}(index)
	}
	waitGroup.Wait()
	close(results)

	ordered := make([][]byte, count)
	errorsByIndex := make([]error, count)
	for result := range results {
		if result.err != nil {
			errorsByIndex[result.index] = result.err
			continue
		}
		ordered[result.index] = result.body
	}

	merged := dto.ImageResponse{Data: make([]dto.ImageData, 0, count), Created: time.Now().Unix()}
	for index, body := range ordered {
		if len(body) == 0 {
			continue
		}
		var response dto.ImageResponse
		if err := common.Unmarshal(body, &response); err != nil {
			errorsByIndex[index] = fmt.Errorf("响应格式无效: %w", err)
			continue
		}
		if len(response.Data) == 0 {
			errorsByIndex[index] = fmt.Errorf("没有返回图片结果")
			continue
		}
		if response.Created > merged.Created {
			merged.Created = response.Created
		}
		merged.Data = append(merged.Data, response.Data...)
	}
	if len(merged.Data) == 0 {
		for index, batchErr := range errorsByIndex {
			if batchErr != nil {
				return nil, fmt.Errorf("第 %d 张图片生成失败: %w", index+1, batchErr)
			}
		}
		return nil, fmt.Errorf("所有图片生成请求均未返回结果")
	}
	if len(merged.Data) < int(count) {
		failures := make([]string, 0)
		for index, batchErr := range errorsByIndex {
			if batchErr != nil {
				failures = append(failures, fmt.Sprintf("第 %d 张: %s", index+1, batchErr.Error()))
			}
		}
		logger.LogWarn(nil, fmt.Sprintf("image workshop task %s partially completed (%d/%d): %s", task.TaskID, len(merged.Data), count, strings.Join(failures, "; ")))
	}
	return common.Marshal(merged)
}

func imageAsyncTaskMetadata(c *gin.Context, request *dto.ImageRequest) map[string]interface{} {
	if c.GetBool(string(constant.ContextKeyImageWorkshopRequest)) {
		metadata := map[string]interface{}{"source": "image_workshop"}
		if request != nil {
			billing := service.ResolveImageWorkshopResolutionBilling(request.Size)
			metadata["request_size"] = request.Size
			metadata["billing_tier"] = billing.Tier
			metadata["billing_source"] = billing.Source
			if price, ok := ratio_setting.GetImageResolutionPrice(request.Model, billing.Tier); ok {
				metadata["billing_strategy"] = "resolution_price"
				metadata["billing_unit_price"] = price
				metadata["billing_multiplier"] = 1.0
			} else {
				metadata["billing_strategy"] = "fixed_price_multiplier"
				metadata["billing_multiplier"] = billing.Multiplier
			}
		}
		return metadata
	}
	return nil
}

func buildAsyncImageRelayContext(task *model.Task, data service.ImageAsyncTaskData) (*gin.Context, *httptest.ResponseRecorder, error) {
	token, err := model.GetTokenByIds(task.PrivateData.TokenId, task.UserId)
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
	req.Header.Set("Authorization", "Bearer sk-"+token.Key)
	c.Request = req
	if isImageWorkshopTask(data) {
		c.Set(string(constant.ContextKeyImageWorkshopRequest), true)
	}

	middleware.TokenAuth()(c)
	if c.IsAborted() {
		return nil, recorder, fmt.Errorf("%s", strings.TrimSpace(recorder.Body.String()))
	}
	middleware.Distribute()(c)
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
	if isImageWorkshopTask(data) {
		message = imageWorkshopFailureMessage(message)
	}
	data.Error = &service.ImageAsyncTaskError{Message: message}
	task.SetData(data)
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"
	task.FailReason = message
	task.FinishTime = time.Now().Unix()
	task.UpdatedAt = task.FinishTime
	_, _ = task.UpdateWithStatus(model.TaskStatusInProgress)
}

func imageWorkshopFailureMessage(message string) string {
	normalized := strings.ToLower(strings.TrimSpace(message))
	if normalized == "" ||
		strings.Contains(normalized, "unexpected end of json input") ||
		strings.Contains(normalized, "unexpected eof") ||
		strings.Contains(normalized, "upstream request failed") {
		return "上游服务暂时不可用，请稍后重试"
	}
	return strings.TrimSpace(message)
}

func removeAsyncQuery(rawQuery string) string {
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return ""
	}
	values.Del("async")
	return values.Encode()
}

func isImageAsyncQuery(c *gin.Context) bool {
	switch strings.ToLower(strings.TrimSpace(c.Query("async"))) {
	case "true", "1", "yes", "on":
		return true
	default:
		return false
	}
}

func signImageTaskResultURLs(task *model.Task, result []byte, files []service.ImageResultFile, now time.Time) ([]byte, []service.ImageResultFile, error) {
	if len(files) == 0 {
		return result, files, nil
	}
	var imageResp dto.ImageResponse
	if err := common.Unmarshal(result, &imageResp); err != nil {
		return nil, nil, err
	}
	for i := range files {
		signedURL := buildImageTaskFileSignedURL(task, files[i], imageTaskSignedURLExpiresAt(files[i], now))
		for j := range imageResp.Data {
			if imageResp.Data[j].Url == files[i].URL {
				imageResp.Data[j].Url = signedURL
			}
		}
		files[i].URL = signedURL
	}
	rewritten, err := common.Marshal(imageResp)
	if err != nil {
		return nil, nil, err
	}
	return rewritten, files, nil
}

func imageTaskSignedURLExpiresAt(file service.ImageResultFile, now time.Time) time.Time {
	minutes := common.GetEnvOrDefault("IMAGE_WORKSHOP_SIGNED_URL_TTL_MINUTES", 30)
	if minutes <= 0 {
		minutes = 30
	}
	expiresAt := now.Add(time.Duration(minutes) * time.Minute)
	if file.ExpiresAt > 0 && expiresAt.Unix() > file.ExpiresAt {
		expiresAt = time.Unix(file.ExpiresAt, 0)
	}
	return expiresAt
}

func buildImageTaskFileSignedURL(task *model.Task, file service.ImageResultFile, expiresAt time.Time) string {
	expiresUnix := expiresAt.Unix()
	values := url.Values{}
	values.Set("expires", strconv.FormatInt(expiresUnix, 10))
	values.Set("signature", signImageTaskFile(task, file.FileID, expiresUnix))
	return fmt.Sprintf("/v1/images/tasks/%s/files/%s?%s", task.TaskID, file.FileID, values.Encode())
}

func hasImageTaskFileSignature(c *gin.Context) bool {
	return c.Query("expires") != "" || c.Query("signature") != ""
}

func getImageTaskFileBySignature(c *gin.Context) {
	task, exists, err := model.GetByOnlyTaskId(c.Param("task_id"))
	if err != nil || !exists || !service.IsImageAsyncTask(task) {
		service.WriteImageTaskNotFound(c)
		return
	}
	expiresAt, err := strconv.ParseInt(c.Query("expires"), 10, 64)
	if err != nil || time.Now().Unix() > expiresAt {
		service.WriteImageTaskNotFound(c)
		return
	}
	expected := signImageTaskFile(task, c.Param("file_id"), expiresAt)
	if !hmac.Equal([]byte(expected), []byte(c.Query("signature"))) {
		service.WriteImageTaskNotFound(c)
		return
	}
	serveImageTaskFile(c, task)
}

func serveImageTaskFile(c *gin.Context, task *model.Task) {
	path, mimeType, err := imageResultStore.ResolveTaskFile(task, c.Param("file_id"), time.Now())
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": err.Error(), "type": "invalid_request_error"}})
		return
	}
	c.Header("Content-Type", mimeType)
	c.File(path)
}

func signImageTaskFile(task *model.Task, fileID string, expiresAt int64) string {
	material := fmt.Sprintf("%s:%s:%d:%d:%d", task.TaskID, fileID, task.UserId, task.PrivateData.TokenId, expiresAt)
	return common.GenerateHMAC(material)
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
