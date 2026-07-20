package controller

import (
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

type imageWorkshopTokenResponse struct {
	ID                 int    `json:"id"`
	Name               string `json:"name"`
	Key                string `json:"key"`
	Group              string `json:"group"`
	Status             int    `json:"status"`
	CreatedTime        int64  `json:"created_time"`
	AccessedTime       int64  `json:"accessed_time"`
	ExpiredTime        int64  `json:"expired_time"`
	RemainQuota        int    `json:"remain_quota"`
	UnlimitedQuota     bool   `json:"unlimited_quota"`
	UsedQuota          int    `json:"used_quota"`
	ModelLimitsEnabled bool   `json:"model_limits_enabled"`
	ModelLimits        string `json:"model_limits"`
	CrossGroupRetry    bool   `json:"cross_group_retry"`
}

type imageWorkshopGenerationRequest struct {
	TokenID        int             `json:"token_id"`
	Model          string          `json:"model"`
	Prompt         string          `json:"prompt"`
	N              *uint           `json:"n,omitempty"`
	Size           string          `json:"size,omitempty"`
	Quality        string          `json:"quality,omitempty"`
	OutputFormat   string          `json:"output_format,omitempty"`
	ResponseFormat string          `json:"response_format,omitempty"`
	Moderation     json.RawMessage `json:"moderation,omitempty"`
}

type imageWorkshopTaskResponse struct {
	TaskID          string                       `json:"task_id"`
	Status          string                       `json:"status"`
	Progress        string                       `json:"progress"`
	Model           string                       `json:"model,omitempty"`
	Prompt          string                       `json:"prompt,omitempty"`
	N               uint                         `json:"n"`
	Size            string                       `json:"size,omitempty"`
	Quality         string                       `json:"quality,omitempty"`
	OutputFormat    string                       `json:"output_format,omitempty"`
	SubmitTime      int64                        `json:"submit_time"`
	StartTime       int64                        `json:"start_time,omitempty"`
	FinishTime      int64                        `json:"finish_time,omitempty"`
	ExpiresAt       int64                        `json:"expires_at,omitempty"`
	ResultAvailable bool                         `json:"result_available"`
	Result          json.RawMessage              `json:"result,omitempty"`
	Error           *service.ImageAsyncTaskError `json:"error,omitempty"`
}

type imageWorkshopDeleteTasksRequest struct {
	TaskIDs []string `json:"task_ids"`
}

var imageWorkshopGenerationFields = map[string]struct{}{
	"token_id": {}, "model": {}, "prompt": {}, "n": {}, "size": {}, "quality": {},
	"output_format": {}, "response_format": {}, "moderation": {},
}

const imageWorkshopRequestContextKey = "image_workshop_request"

func ListImageWorkshopTokens(c *gin.Context) {
	limit := operation_setting.GetMaxUserTokens()
	if limit <= 0 {
		limit = 100
	}
	tokens, err := model.GetAllUserTokens(c.GetInt("id"), 0, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	resp := make([]imageWorkshopTokenResponse, 0, len(tokens))
	for _, token := range tokens {
		resp = append(resp, imageWorkshopTokenResponse{
			ID:                 token.Id,
			Name:               token.Name,
			Key:                token.GetMaskedKey(),
			Group:              token.Group,
			Status:             token.Status,
			CreatedTime:        token.CreatedTime,
			AccessedTime:       token.AccessedTime,
			ExpiredTime:        token.ExpiredTime,
			RemainQuota:        token.RemainQuota,
			UnlimitedQuota:     token.UnlimitedQuota,
			UsedQuota:          token.UsedQuota,
			ModelLimitsEnabled: token.ModelLimitsEnabled,
			ModelLimits:        token.ModelLimits,
			CrossGroupRetry:    token.CrossGroupRetry,
		})
	}
	common.ApiSuccess(c, resp)
}

func GetImageWorkshopOptions(c *gin.Context) {
	tokenID, err := strconv.Atoi(c.Query("token_id"))
	if err != nil || tokenID <= 0 {
		common.ApiErrorMsg(c, "token_id is invalid")
		return
	}
	token, err := model.GetTokenByIds(tokenID, c.GetInt("id"))
	if err != nil {
		common.ApiErrorMsg(c, "token not found")
		return
	}
	if err := service.ValidateImageWorkshopOptionsToken(c.GetInt("id"), token); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	capabilities, err := service.GetImageWorkshopModelCapabilities(c.GetInt("id"), token)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"token_id": tokenID,
		"models":   capabilities,
	})
}

func PrepareImageWorkshopGeneration(c *gin.Context) {
	token, body, ok := buildImageWorkshopGenerationBody(c)
	if !ok {
		c.Abort()
		return
	}
	if err := replaceImageWorkshopRequestBody(c, body); err != nil {
		common.ApiError(c, err)
		c.Abort()
		return
	}
	c.Request.Header.Set("Authorization", "Bearer sk-"+token.Key)
	if c.Request.Header.Get("Content-Type") == "" {
		c.Request.Header.Set("Content-Type", "application/json")
	}
	c.Set(imageWorkshopRequestContextKey, true)
}

func CreateImageWorkshopGeneration(c *gin.Context) {
	task, submitErr := enqueueAsyncImageGeneration(c)
	if submitErr != nil {
		common.ApiErrorMsg(c, submitErr.Message)
		return
	}

	common.ApiSuccess(c, gin.H{
		"task_id": task.TaskID,
		"status":  "queued",
	})
}

func GetImageWorkshopTask(c *gin.Context) {
	task, exists, err := service.GetUserImageTask(c.GetInt("id"), c.Param("task_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exists {
		common.ApiErrorMsg(c, "image task not found")
		return
	}
	resp, err := buildImageWorkshopTaskResponse(task, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, resp)
}

func ListImageWorkshopTasks(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	if page, err := strconv.Atoi(c.Query("page")); err == nil && page > 0 {
		pageInfo.Page = page
	}
	tasks, total, err := model.ListUserImageTasks(c.GetInt("id"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]imageWorkshopTaskResponse, 0, len(tasks))
	now := time.Now()
	for _, task := range tasks {
		item, err := buildImageWorkshopTaskResponse(task, now)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		items = append(items, item)
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func DeleteImageWorkshopTasks(c *gin.Context) {
	userID := c.GetInt("id")
	scope := strings.ToLower(strings.TrimSpace(c.Query("scope")))
	var (
		deletedTaskIDs []string
		err            error
	)

	switch scope {
	case "before_3d":
		deletedTaskIDs, err = model.DeleteUserImageTasksBefore(userID, time.Now().AddDate(0, 0, -3).Unix())
	case "before_7d":
		deletedTaskIDs, err = model.DeleteUserImageTasksBefore(userID, time.Now().AddDate(0, 0, -7).Unix())
	case "all":
		deletedTaskIDs, err = model.DeleteAllUserImageTasks(userID)
	case "":
		var request imageWorkshopDeleteTasksRequest
		if bindErr := c.ShouldBindJSON(&request); bindErr != nil {
			common.ApiErrorMsg(c, "task_ids is required")
			return
		}
		seen := make(map[string]struct{}, len(request.TaskIDs))
		taskIDs := make([]string, 0, len(request.TaskIDs))
		for _, taskID := range request.TaskIDs {
			taskID = strings.TrimSpace(taskID)
			if taskID == "" {
				continue
			}
			if _, exists := seen[taskID]; exists {
				continue
			}
			seen[taskID] = struct{}{}
			taskIDs = append(taskIDs, taskID)
		}
		if len(taskIDs) == 0 || len(taskIDs) > 100 {
			common.ApiErrorMsg(c, "task_ids must contain between 1 and 100 items")
			return
		}
		deletedTaskIDs, err = model.DeleteUserImageTasksByIDs(userID, taskIDs)
	default:
		common.ApiErrorMsg(c, "scope must be before_3d, before_7d or all")
		return
	}

	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"deleted":  len(deletedTaskIDs),
		"task_ids": deletedTaskIDs,
	})
}

func buildImageWorkshopGenerationBody(c *gin.Context) (*model.Token, []byte, bool) {
	bodyStorage, err := common.GetBodyStorage(c)
	if err != nil {
		common.ApiError(c, err)
		return nil, nil, false
	}
	body, err := bodyStorage.Bytes()
	if err != nil {
		common.ApiError(c, err)
		return nil, nil, false
	}
	var rawPayload map[string]json.RawMessage
	if err = common.Unmarshal(body, &rawPayload); err != nil {
		common.ApiError(c, err)
		return nil, nil, false
	}
	unknownFields := make([]string, 0)
	for field := range rawPayload {
		if _, ok := imageWorkshopGenerationFields[field]; !ok {
			unknownFields = append(unknownFields, field)
		}
	}
	if len(unknownFields) > 0 {
		sort.Strings(unknownFields)
		common.ApiErrorMsg(c, "unsupported fields: "+strings.Join(unknownFields, ", "))
		return nil, nil, false
	}

	var request imageWorkshopGenerationRequest
	if err = common.Unmarshal(body, &request); err != nil {
		common.ApiError(c, err)
		return nil, nil, false
	}
	if request.TokenID <= 0 {
		common.ApiErrorMsg(c, "token_id is invalid")
		return nil, nil, false
	}
	token, err := model.GetTokenByIds(request.TokenID, c.GetInt("id"))
	if err != nil {
		common.ApiErrorMsg(c, "token not found")
		return nil, nil, false
	}
	capabilities, err := service.GetImageWorkshopModelCapabilities(c.GetInt("id"), token)
	if err != nil {
		common.ApiError(c, err)
		return nil, nil, false
	}
	capability, ok := service.FindImageWorkshopModelCapability(capabilities, strings.TrimSpace(request.Model))
	if !ok {
		common.ApiErrorMsg(c, "model is not available for image workshop")
		return nil, nil, false
	}
	normalized, err := normalizeImageWorkshopGenerationRequest(request, capability)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return nil, nil, false
	}

	rewritten, err := common.Marshal(normalized)
	if err != nil {
		common.ApiError(c, err)
		return nil, nil, false
	}
	return token, rewritten, true
}

func normalizeImageWorkshopGenerationRequest(request imageWorkshopGenerationRequest, capability service.ImageWorkshopModelCapability) (map[string]any, error) {
	prompt := strings.TrimSpace(request.Prompt)
	if prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	if utf8.RuneCountInString(prompt) > 32000 {
		return nil, fmt.Errorf("prompt is too long")
	}

	n := uint(1)
	if request.N != nil {
		n = *request.N
	}
	if n == 0 || int(n) > capability.MaxImages {
		return nil, fmt.Errorf("n must be between 1 and %d", capability.MaxImages)
	}
	size, err := service.NormalizeImageWorkshopSize(capability, request.Size)
	if err != nil {
		return nil, err
	}
	quality := strings.ToLower(strings.TrimSpace(request.Quality))
	if quality == "" {
		quality = capability.DefaultQuality
	}
	if !containsImageWorkshopOption(capability.Qualities, quality) {
		return nil, fmt.Errorf("quality is not supported by model %s", capability.Model)
	}
	outputFormat := strings.ToLower(strings.TrimSpace(request.OutputFormat))
	if outputFormat == "" {
		outputFormat = capability.DefaultOutputFormat
	}
	if outputFormat != "" && !containsImageWorkshopOption(capability.OutputFormats, outputFormat) {
		return nil, fmt.Errorf("output_format is not supported by model %s", capability.Model)
	}

	payload := map[string]any{
		"model":           capability.Model,
		"prompt":          prompt,
		"n":               n,
		"response_format": "b64_json",
		"moderation":      "auto",
	}
	if size != "auto" || len(capability.Sizes) > 1 {
		payload["size"] = size
	}
	if quality != "auto" || len(capability.Qualities) > 1 {
		payload["quality"] = quality
	}
	if outputFormat != "" {
		payload["output_format"] = outputFormat
	}
	return payload, nil
}

func containsImageWorkshopOption(options []string, value string) bool {
	for _, option := range options {
		if option == value {
			return true
		}
	}
	return false
}

func buildImageWorkshopTaskResponse(task *model.Task, now time.Time) (imageWorkshopTaskResponse, error) {
	response := imageWorkshopTaskResponse{
		TaskID:     task.TaskID,
		Status:     service.ImageTaskPublicStatus(task.Status),
		Progress:   task.Progress,
		Model:      task.Properties.OriginModelName,
		N:          1,
		SubmitTime: task.SubmitTime,
		StartTime:  task.StartTime,
		FinishTime: task.FinishTime,
	}
	var data service.ImageAsyncTaskData
	if len(task.Data) > 0 {
		if err := task.GetData(&data); err != nil {
			return response, err
		}
	}
	if len(data.Request.Body) > 0 {
		var request imageWorkshopGenerationRequest
		if err := common.Unmarshal(data.Request.Body, &request); err == nil {
			response.Prompt = request.Prompt
			response.Size = request.Size
			response.Quality = request.Quality
			response.OutputFormat = request.OutputFormat
			if request.N != nil {
				response.N = *request.N
			}
		}
	}
	response.ExpiresAt = data.ExpiresAt
	if task.Status == model.TaskStatusFailure {
		response.Error = data.Error
		if response.Error == nil {
			response.Error = &service.ImageAsyncTaskError{Message: task.FailReason}
		}
		return response, nil
	}
	if task.Status != model.TaskStatusSuccess || len(data.Result) == 0 {
		return response, nil
	}
	if !imageWorkshopTaskFilesAvailable(task, data, now) {
		return response, nil
	}
	result, _, err := signImageTaskResultURLs(task, data.Result, data.Files, now)
	if err != nil {
		return response, err
	}
	response.ResultAvailable = true
	response.Result = json.RawMessage(result)
	return response, nil
}

func imageWorkshopTaskFilesAvailable(task *model.Task, data service.ImageAsyncTaskData, now time.Time) bool {
	if len(data.Files) == 0 {
		if len(data.Result) == 0 || (data.ExpiresAt > 0 && now.Unix() > data.ExpiresAt) {
			return false
		}
		var result dto.ImageResponse
		if err := common.Unmarshal(data.Result, &result); err != nil {
			return false
		}
		for _, image := range result.Data {
			if strings.HasPrefix(image.Url, "/v1/images/tasks/") {
				return false
			}
		}
		return len(result.Data) > 0
	}
	for _, file := range data.Files {
		if _, _, err := imageResultStore.ResolveTaskFile(task, file.FileID, now); err != nil {
			return false
		}
	}
	return true
}

func finalizeImageWorkshopRequestForSelectedChannel(c *gin.Context) error {
	bodyStorage, err := common.GetBodyStorage(c)
	if err != nil {
		return err
	}
	body, err := bodyStorage.Bytes()
	if err != nil {
		return err
	}
	var payload map[string]json.RawMessage
	if err := common.Unmarshal(body, &payload); err != nil {
		return err
	}
	var modelName string
	_ = common.Unmarshal(payload["model"], &modelName)
	lowerModel := strings.ToLower(modelName)
	baseURL := common.GetContextKeyString(c, constant.ContextKeyChannelBaseUrl)
	parsed, parseErr := url.Parse(baseURL)
	if parseErr == nil && strings.EqualFold(parsed.Hostname(), "api.openai.com") &&
		(strings.HasPrefix(lowerModel, "gpt-image-") || lowerModel == "chatgpt-image-latest") {
		return nil
	}
	delete(payload, "moderation")
	rewritten, err := common.Marshal(payload)
	if err != nil {
		return err
	}
	return replaceImageWorkshopRequestBody(c, rewritten)
}

func replaceImageWorkshopRequestBody(c *gin.Context, body []byte) error {
	common.CleanupBodyStorage(c)
	storage, err := common.CreateBodyStorage(body)
	if err != nil {
		return err
	}
	c.Set(common.KeyBodyStorage, storage)
	c.Set(common.KeyRequestBody, body)
	c.Request.Body = io.NopCloser(storage)
	c.Request.ContentLength = int64(len(body))
	return nil
}
