package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
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
	TokenID           int             `json:"token_id"`
	Model             string          `json:"model"`
	Prompt            string          `json:"prompt"`
	N                 *uint           `json:"n,omitempty"`
	Size              string          `json:"size,omitempty"`
	Quality           string          `json:"quality,omitempty"`
	OutputFormat      string          `json:"output_format,omitempty"`
	TransparentOutput bool            `json:"transparent_output,omitempty"`
	ResponseFormat    string          `json:"response_format,omitempty"`
	Moderation        json.RawMessage `json:"moderation,omitempty"`
}

type imageWorkshopTaskResponse struct {
	TaskID              string                       `json:"task_id"`
	Status              string                       `json:"status"`
	Progress            string                       `json:"progress"`
	Model               string                       `json:"model,omitempty"`
	Prompt              string                       `json:"prompt,omitempty"`
	N                   uint                         `json:"n"`
	Size                string                       `json:"size,omitempty"`
	Quality             string                       `json:"quality,omitempty"`
	OutputFormat        string                       `json:"output_format,omitempty"`
	TransparentOutput   bool                         `json:"transparent_output,omitempty"`
	BillingTier         string                       `json:"billing_tier,omitempty"`
	BillingMultiplier   float64                      `json:"billing_multiplier,omitempty"`
	BillingUnitPrice    float64                      `json:"billing_unit_price,omitempty"`
	BillingStrategy     string                       `json:"billing_strategy,omitempty"`
	BillingChannelID    int                          `json:"billing_channel_id,omitempty"`
	ReferenceImageCount int                          `json:"reference_image_count,omitempty"`
	OutputSizes         []string                     `json:"output_sizes,omitempty"`
	SubmitTime          int64                        `json:"submit_time"`
	StartTime           int64                        `json:"start_time,omitempty"`
	FinishTime          int64                        `json:"finish_time,omitempty"`
	ExpiresAt           int64                        `json:"expires_at,omitempty"`
	ResultAvailable     bool                         `json:"result_available"`
	Result              json.RawMessage              `json:"result,omitempty"`
	Error               *service.ImageAsyncTaskError `json:"error,omitempty"`
}

type imageWorkshopDeleteTasksRequest struct {
	TaskIDs []string `json:"task_ids"`
}

var imageWorkshopGenerationFields = map[string]struct{}{
	"token_id": {}, "model": {}, "prompt": {}, "n": {}, "size": {}, "quality": {},
	"output_format": {}, "transparent_output": {}, "response_format": {}, "moderation": {},
}

const imageWorkshopPromptSuffix = "不需要反问我任何问题，直接按照我提示词的要求生成图片。"

const imageWorkshopTransparentPrompt = `[背景指令]
背景色选择规则：如果主体包含绿色系（绿、青绿、黄绿、草绿等）颜色，使用纯洋红色(#FF00FF)背景；否则一律使用纯绿色(#00FF00)背景。
背景要求：整张画布仅由所选纯色填充，无任何渐变、纹理、阴影、光照变化、地面或环境元素。
主体要求：单主体、完整呈现、轮廓清晰锐利。主体与背景之间保持干净的边缘分离，不要有颜色溢出或混合。
禁止：主体本身、描边、光晕、投影或反射中不能出现所选背景色。`

const (
	imageWorkshopMaxReferenceImages          = 9
	imageWorkshopMaxReferenceFileBytes       = 20 << 20
	imageWorkshopMaxReferenceRequestBytes    = 100 << 20
	imageWorkshopReferenceCountContextKey    = "image_workshop_reference_count"
	imageWorkshopOutputCountContextKey       = "image_workshop_output_count"
	imageWorkshopTransparentOutputContextKey = "image_workshop_transparent_output"
)

const imageWorkshopRetryTaskContextKey = "image_workshop_retry_task"

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
	if strings.HasPrefix(strings.ToLower(c.GetHeader("Content-Type")), "multipart/form-data") {
		token, body, contentType, referenceCount, outputCount, ok := buildImageWorkshopReferenceGenerationBody(c)
		if !ok {
			c.Abort()
			return
		}
		if err := replaceImageWorkshopRequestBody(c, body); err != nil {
			common.ApiError(c, err)
			c.Abort()
			return
		}
		resetImageWorkshopMultipartRequest(c, contentType)
		c.Request.URL.Path = "/v1/images/edits"
		c.Set(imageWorkshopReferenceCountContextKey, referenceCount)
		c.Set(imageWorkshopOutputCountContextKey, int(outputCount))
		prepareImageWorkshopRequestContext(c, token)
		return
	}
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
	prepareImageWorkshopRequestContext(c, token)
}

func buildImageWorkshopReferenceGenerationBody(c *gin.Context) (*model.Token, []byte, string, int, uint, bool) {
	form, err := common.ParseMultipartFormReusable(c)
	if err != nil {
		common.ApiErrorMsg(c, "无法读取参考图上传内容")
		return nil, nil, "", 0, 0, false
	}
	defer form.RemoveAll()

	unknownFields := make([]string, 0)
	for field := range form.Value {
		if _, ok := imageWorkshopGenerationFields[field]; !ok {
			unknownFields = append(unknownFields, field)
		}
	}
	for field := range form.File {
		if field != "image" && field != "image[]" && !strings.HasPrefix(field, "image[") {
			unknownFields = append(unknownFields, field)
		}
	}
	if len(unknownFields) > 0 {
		sort.Strings(unknownFields)
		common.ApiErrorMsg(c, "unsupported fields: "+strings.Join(unknownFields, ", "))
		return nil, nil, "", 0, 0, false
	}

	tokenID, err := strconv.Atoi(strings.TrimSpace(firstImageWorkshopFormValue(form, "token_id")))
	if err != nil || tokenID <= 0 {
		common.ApiErrorMsg(c, "token_id is invalid")
		return nil, nil, "", 0, 0, false
	}
	token, err := model.GetTokenByIds(tokenID, c.GetInt("id"))
	if err != nil {
		common.ApiErrorMsg(c, "token not found")
		return nil, nil, "", 0, 0, false
	}
	capabilities, err := service.GetImageWorkshopModelCapabilities(c.GetInt("id"), token)
	if err != nil {
		common.ApiError(c, err)
		return nil, nil, "", 0, 0, false
	}
	request, err := imageWorkshopGenerationRequestFromMultipart(form)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return nil, nil, "", 0, 0, false
	}
	capability, ok := service.FindImageWorkshopModelCapability(capabilities, strings.TrimSpace(request.Model))
	if !ok {
		common.ApiErrorMsg(c, "model is not available for image workshop")
		return nil, nil, "", 0, 0, false
	}
	if !capability.SupportsReferenceImages || capability.MaxReferenceImages <= 0 {
		common.ApiErrorMsg(c, "当前模型不支持参考图")
		return nil, nil, "", 0, 0, false
	}
	files := imageWorkshopReferenceFiles(form)
	maxReferences := min(imageWorkshopMaxReferenceImages, capability.MaxReferenceImages)
	if len(files) == 0 {
		common.ApiErrorMsg(c, "请至少上传一张参考图")
		return nil, nil, "", 0, 0, false
	}
	if len(files) > maxReferences {
		common.ApiErrorMsg(c, fmt.Sprintf("参考图最多上传 %d 张", maxReferences))
		return nil, nil, "", 0, 0, false
	}
	if err := validateImageWorkshopReferenceFiles(files); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return nil, nil, "", 0, 0, false
	}
	normalized, err := normalizeImageWorkshopGenerationRequest(request, capability)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return nil, nil, "", 0, 0, false
	}
	if err := prepareImageWorkshopTransparentOutput(c, request, normalized); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return nil, nil, "", 0, 0, false
	}
	outputCount := normalized["n"].(uint)
	normalized["n"] = uint(1)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, field := range []string{"model", "prompt", "n", "size", "quality", "output_format", "response_format", "moderation"} {
		value, exists := normalized[field]
		if !exists {
			continue
		}
		if err := writer.WriteField(field, fmt.Sprint(value)); err != nil {
			_ = writer.Close()
			common.ApiError(c, err)
			return nil, nil, "", 0, 0, false
		}
	}
	fileField := "image"
	if len(files) > 1 {
		fileField = "image[]"
	}
	for _, fileHeader := range files {
		file, openErr := fileHeader.Open()
		if openErr != nil {
			_ = writer.Close()
			common.ApiErrorMsg(c, "无法读取参考图")
			return nil, nil, "", 0, 0, false
		}
		part, createErr := writer.CreateFormFile(fileField, fileHeader.Filename)
		if createErr == nil {
			_, createErr = io.Copy(part, file)
		}
		_ = file.Close()
		if createErr != nil {
			_ = writer.Close()
			common.ApiErrorMsg(c, "无法处理参考图")
			return nil, nil, "", 0, 0, false
		}
	}
	if err := writer.Close(); err != nil {
		common.ApiError(c, err)
		return nil, nil, "", 0, 0, false
	}
	return token, body.Bytes(), writer.FormDataContentType(), len(files), outputCount, true
}

func imageWorkshopGenerationRequestFromMultipart(form *multipart.Form) (imageWorkshopGenerationRequest, error) {
	request := imageWorkshopGenerationRequest{
		Model:        firstImageWorkshopFormValue(form, "model"),
		Prompt:       firstImageWorkshopFormValue(form, "prompt"),
		Size:         firstImageWorkshopFormValue(form, "size"),
		Quality:      firstImageWorkshopFormValue(form, "quality"),
		OutputFormat: firstImageWorkshopFormValue(form, "output_format"),
	}
	if rawTransparent := strings.TrimSpace(firstImageWorkshopFormValue(form, "transparent_output")); rawTransparent != "" {
		transparent, err := strconv.ParseBool(rawTransparent)
		if err != nil {
			return request, fmt.Errorf("transparent_output must be a boolean")
		}
		request.TransparentOutput = transparent
	}
	if rawCount := strings.TrimSpace(firstImageWorkshopFormValue(form, "n")); rawCount != "" {
		count, err := strconv.ParseUint(rawCount, 10, 32)
		if err != nil {
			return request, fmt.Errorf("n must be a positive integer")
		}
		n := uint(count)
		request.N = &n
	}
	return request, nil
}

func firstImageWorkshopFormValue(form *multipart.Form, field string) string {
	if form == nil || len(form.Value[field]) == 0 {
		return ""
	}
	return form.Value[field][0]
}

func imageWorkshopReferenceFiles(form *multipart.Form) []*multipart.FileHeader {
	if form == nil {
		return nil
	}
	fields := make([]string, 0)
	for field := range form.File {
		if field == "image" || field == "image[]" || strings.HasPrefix(field, "image[") {
			fields = append(fields, field)
		}
	}
	sort.Strings(fields)
	files := make([]*multipart.FileHeader, 0)
	for _, field := range fields {
		files = append(files, form.File[field]...)
	}
	return files
}

func validateImageWorkshopReferenceFiles(files []*multipart.FileHeader) error {
	var total int64
	for _, fileHeader := range files {
		if fileHeader == nil || fileHeader.Size <= 0 {
			return fmt.Errorf("参考图不能为空")
		}
		if fileHeader.Size > imageWorkshopMaxReferenceFileBytes {
			return fmt.Errorf("单张参考图不能超过 20 MB")
		}
		total += fileHeader.Size
		if total > imageWorkshopMaxReferenceRequestBytes {
			return fmt.Errorf("参考图总大小不能超过 100 MB")
		}
		file, err := fileHeader.Open()
		if err != nil {
			return fmt.Errorf("无法读取参考图")
		}
		header := make([]byte, 512)
		read, readErr := file.Read(header)
		_ = file.Close()
		if readErr != nil && readErr != io.EOF {
			return fmt.Errorf("无法读取参考图")
		}
		mimeType := http.DetectContentType(header[:read])
		if mimeType != "image/png" && mimeType != "image/jpeg" && mimeType != "image/webp" {
			return fmt.Errorf("参考图仅支持 PNG、JPEG 和 WEBP 格式")
		}
	}
	return nil
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

func PrepareImageWorkshopTaskRetry(c *gin.Context) {
	task, exists, err := service.GetUserImageTask(c.GetInt("id"), c.Param("task_id"))
	if err != nil {
		common.ApiError(c, err)
		c.Abort()
		return
	}
	if !exists {
		common.ApiErrorMsg(c, "image task not found")
		c.Abort()
		return
	}
	if task.Status != model.TaskStatusFailure {
		common.ApiErrorMsg(c, "only failed image tasks can be retried")
		c.Abort()
		return
	}

	var data service.ImageAsyncTaskData
	if err = task.GetData(&data); err != nil {
		common.ApiError(c, err)
		c.Abort()
		return
	}
	if !isImageWorkshopTask(data) || (len(data.Request.Body) == 0 && data.Request.BodyPath == "") {
		common.ApiErrorMsg(c, "image workshop task request is unavailable")
		c.Abort()
		return
	}
	if data.Request.BodyPath != "" {
		file, openErr := imageRequestStore.Open(data.Request.BodyPath)
		if openErr != nil {
			common.ApiErrorMsg(c, "参考图已过期，请重新上传后生成")
			c.Abort()
			return
		}
		info, statErr := file.Stat()
		if statErr != nil {
			_ = file.Close()
			common.ApiErrorMsg(c, "无法读取原参考图，请重新上传后生成")
			c.Abort()
			return
		}
		common.CleanupBodyStorage(c)
		c.Request.Body = file
		c.Request.ContentLength = info.Size()
		c.Request.Header.Set("Content-Type", data.Request.ContentType)
		c.Request.URL.Path = "/v1/images/edits"
		c.Request.MultipartForm = nil
		c.Request.PostForm = nil
		c.Set("_original_multipart_ct", data.Request.ContentType)
		c.Set(imageWorkshopReferenceCountContextKey, imageWorkshopTaskReferenceCount(data))
		c.Set(imageWorkshopOutputCountContextKey, 1)
	} else {
		body, rewriteErr := rewriteImageWorkshopRequestCount(data.Request.Body, 1)
		if rewriteErr != nil {
			common.ApiError(c, rewriteErr)
			c.Abort()
			return
		}
		if err = replaceImageWorkshopRequestBody(c, body); err != nil {
			common.ApiError(c, err)
			c.Abort()
			return
		}
	}
	token, err := model.GetTokenByIds(task.PrivateData.TokenId, task.UserId)
	if err != nil {
		common.ApiErrorMsg(c, "the API key used by this task is no longer available")
		c.Abort()
		return
	}

	c.Set(imageWorkshopRetryTaskContextKey, task)
	prepareImageWorkshopRequestContext(c, token)
}

func RetryImageWorkshopTask(c *gin.Context) {
	value, exists := c.Get(imageWorkshopRetryTaskContextKey)
	task, ok := value.(*model.Task)
	if !exists || !ok || task == nil {
		common.ApiErrorMsg(c, "image task not found")
		return
	}

	var data service.ImageAsyncTaskData
	if err := task.GetData(&data); err != nil {
		common.ApiError(c, err)
		return
	}
	if data.Request.BodyPath == "" {
		bodyStorage, err := common.GetBodyStorage(c)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		body, err := bodyStorage.Bytes()
		if err != nil {
			common.ApiError(c, err)
			return
		}
		data.Request.Body = json.RawMessage(body)
	} else {
		data.Request.ImageCount = 1
	}
	if data.Metadata != nil {
		data.Metadata["output_count"] = 1
	}
	data.Result = nil
	data.Error = nil
	data.Files = nil
	data.ExpiresAt = 0

	now := time.Now().Unix()
	task.SetData(data)
	task.Status = model.TaskStatusQueued
	task.Progress = "0%"
	task.FailReason = ""
	task.SubmitTime = now
	task.StartTime = 0
	task.FinishTime = 0
	task.UpdatedAt = now
	task.ChannelId = common.GetContextKeyInt(c, constant.ContextKeyChannelId)
	selectedGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	if autoGroup := common.GetContextKeyString(c, constant.ContextKeyAutoGroup); autoGroup != "" {
		selectedGroup = autoGroup
	}
	if selectedGroup != "" {
		task.Group = selectedGroup
	}
	if won, err := task.UpdateWithStatus(model.TaskStatusFailure); err != nil {
		common.ApiError(c, err)
		return
	} else if !won {
		common.ApiErrorMsg(c, "image task status changed, please refresh and try again")
		return
	}

	imageAsyncTaskRunner(task.TaskID)
	response, err := buildImageWorkshopTaskResponse(task, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, response)
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
	for _, taskID := range deletedTaskIDs {
		_ = imageRequestStore.RemoveTask(taskID)
	}
	common.ApiSuccess(c, gin.H{
		"deleted":  len(deletedTaskIDs),
		"task_ids": deletedTaskIDs,
	})
}

func imageWorkshopTaskReferenceCount(data service.ImageAsyncTaskData) int {
	if data.Metadata == nil {
		return 0
	}
	switch count := data.Metadata["reference_image_count"].(type) {
	case float64:
		return int(count)
	case int:
		return count
	case uint:
		return int(count)
	default:
		return 0
	}
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
	if err := prepareImageWorkshopTransparentOutput(c, request, normalized); err != nil {
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

func prepareImageWorkshopTransparentOutput(c *gin.Context, request imageWorkshopGenerationRequest, normalized map[string]any) error {
	if !request.TransparentOutput {
		return nil
	}
	outputFormat, _ := normalized["output_format"].(string)
	if strings.ToLower(strings.TrimSpace(outputFormat)) != "png" {
		return fmt.Errorf("透明背景仅支持 PNG 格式")
	}
	c.Set(imageWorkshopTransparentOutputContextKey, true)
	return nil
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
	if data.Metadata != nil {
		if prompt, ok := data.Metadata["prompt"].(string); ok {
			response.Prompt = prompt
		}
		if size, ok := data.Metadata["request_size"].(string); ok {
			response.Size = size
		}
		if quality, ok := data.Metadata["quality"].(string); ok {
			response.Quality = quality
		}
		if outputFormat, ok := data.Metadata["output_format"].(string); ok {
			response.OutputFormat = outputFormat
		}
		if transparentOutput, ok := data.Metadata["transparent_output"].(bool); ok {
			response.TransparentOutput = transparentOutput
		}
		switch outputCount := data.Metadata["output_count"].(type) {
		case float64:
			response.N = uint(outputCount)
		case int:
			response.N = uint(outputCount)
		case uint:
			response.N = outputCount
		}
		switch referenceCount := data.Metadata["reference_image_count"].(type) {
		case float64:
			response.ReferenceImageCount = int(referenceCount)
		case int:
			response.ReferenceImageCount = referenceCount
		}
		if tier, ok := data.Metadata["billing_tier"].(string); ok {
			response.BillingTier = tier
		}
		switch multiplier := data.Metadata["billing_multiplier"].(type) {
		case float64:
			response.BillingMultiplier = multiplier
		case float32:
			response.BillingMultiplier = float64(multiplier)
		case int:
			response.BillingMultiplier = float64(multiplier)
		}
		if price, ok := data.Metadata["billing_unit_price"].(float64); ok {
			response.BillingUnitPrice = price
		}
		if strategy, ok := data.Metadata["billing_strategy"].(string); ok {
			response.BillingStrategy = strategy
		}
		switch channelID := data.Metadata["billing_channel_id"].(type) {
		case float64:
			response.BillingChannelID = int(channelID)
		case int:
			response.BillingChannelID = channelID
		}
	}
	for _, file := range data.Files {
		if file.Width > 0 && file.Height > 0 {
			response.OutputSizes = append(response.OutputSizes, fmt.Sprintf("%dx%d", file.Width, file.Height))
		}
	}
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
	if strings.HasPrefix(strings.ToLower(c.GetHeader("Content-Type")), "multipart/form-data") {
		return finalizeImageWorkshopMultipartRequest(c)
	}
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
	var prompt string
	_ = common.Unmarshal(payload["prompt"], &prompt)
	var size string
	_ = common.Unmarshal(payload["size"], &size)
	payload["prompt"], err = common.Marshal(enhanceImageWorkshopPrompt(
		prompt,
		size,
		c.GetBool(imageWorkshopTransparentOutputContextKey),
	))
	if err != nil {
		return err
	}
	var modelName string
	_ = common.Unmarshal(payload["model"], &modelName)
	lowerModel := strings.ToLower(modelName)
	baseURL := common.GetContextKeyString(c, constant.ContextKeyChannelBaseUrl)
	parsed, parseErr := url.Parse(baseURL)
	if !(parseErr == nil && strings.EqualFold(parsed.Hostname(), "api.openai.com") &&
		(strings.HasPrefix(lowerModel, "gpt-image-") || lowerModel == "chatgpt-image-latest")) {
		delete(payload, "moderation")
	}
	rewritten, err := common.Marshal(payload)
	if err != nil {
		return err
	}
	return replaceImageWorkshopRequestBody(c, rewritten)
}

func finalizeImageWorkshopMultipartRequest(c *gin.Context) error {
	form, err := common.ParseMultipartFormReusable(c)
	if err != nil {
		return err
	}
	defer form.RemoveAll()
	form.Value["prompt"] = []string{enhanceImageWorkshopPrompt(
		firstImageWorkshopFormValue(form, "prompt"),
		firstImageWorkshopFormValue(form, "size"),
		c.GetBool(imageWorkshopTransparentOutputContextKey),
	)}
	modelName := firstImageWorkshopFormValue(form, "model")
	lowerModel := strings.ToLower(modelName)
	baseURL := common.GetContextKeyString(c, constant.ContextKeyChannelBaseUrl)
	parsed, parseErr := url.Parse(baseURL)
	if !(parseErr == nil && strings.EqualFold(parsed.Hostname(), "api.openai.com") &&
		(strings.HasPrefix(lowerModel, "gpt-image-") || lowerModel == "chatgpt-image-latest")) {
		delete(form.Value, "moderation")
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	valueFields := make([]string, 0, len(form.Value))
	for field := range form.Value {
		valueFields = append(valueFields, field)
	}
	sort.Strings(valueFields)
	for _, field := range valueFields {
		for _, value := range form.Value[field] {
			if err := writer.WriteField(field, value); err != nil {
				_ = writer.Close()
				return err
			}
		}
	}
	fileFields := make([]string, 0, len(form.File))
	for field := range form.File {
		fileFields = append(fileFields, field)
	}
	sort.Strings(fileFields)
	for _, field := range fileFields {
		for _, fileHeader := range form.File[field] {
			file, openErr := fileHeader.Open()
			if openErr != nil {
				_ = writer.Close()
				return openErr
			}
			part, createErr := writer.CreateFormFile(field, fileHeader.Filename)
			if createErr == nil {
				_, createErr = io.Copy(part, file)
			}
			_ = file.Close()
			if createErr != nil {
				_ = writer.Close()
				return createErr
			}
		}
	}
	if err := writer.Close(); err != nil {
		return err
	}
	if err := replaceImageWorkshopRequestBody(c, body.Bytes()); err != nil {
		return err
	}
	resetImageWorkshopMultipartRequest(c, writer.FormDataContentType())
	return nil
}

func resetImageWorkshopMultipartRequest(c *gin.Context, contentType string) {
	c.Request.Header.Set("Content-Type", contentType)
	c.Request.MultipartForm = nil
	c.Request.PostForm = nil
	c.Set("_original_multipart_ct", contentType)
}

func enhanceImageWorkshopPrompt(prompt, size string, transparentOutput bool) string {
	prompt = strings.TrimSpace(prompt)
	parts := make([]string, 0, 4)
	if prompt != "" {
		parts = append(parts, prompt)
	}
	if ratio := imageWorkshopAspectRatio(size); ratio != "" && ratio != "1:1" {
		parts = append(parts, "将宽高比设为 "+ratio)
	}
	if transparentOutput {
		parts = append(parts, imageWorkshopTransparentPrompt)
	}
	parts = append(parts, imageWorkshopPromptSuffix)
	return strings.Join(parts, "\n\n")
}

func imageWorkshopAspectRatio(size string) string {
	size = strings.NewReplacer("×", "x", "X", "x").Replace(strings.TrimSpace(size))
	parts := strings.Split(size, "x")
	if len(parts) != 2 {
		return ""
	}
	width, widthErr := strconv.Atoi(strings.TrimSpace(parts[0]))
	height, heightErr := strconv.Atoi(strings.TrimSpace(parts[1]))
	if widthErr != nil || heightErr != nil || width <= 0 || height <= 0 {
		return ""
	}
	originalWidth, originalHeight := width, height
	for height != 0 {
		width, height = height, width%height
	}
	return fmt.Sprintf("%d:%d", originalWidth/width, originalHeight/width)
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

func prepareImageWorkshopRequestContext(c *gin.Context, token *model.Token) {
	c.Request.Header.Set("Authorization", "Bearer sk-"+token.Key)
	if c.Request.Header.Get("Content-Type") == "" {
		c.Request.Header.Set("Content-Type", "application/json")
	}
	c.Set(string(constant.ContextKeyImageWorkshopRequest), true)
}
