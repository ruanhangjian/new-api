package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
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

func CreateImageWorkshopGeneration(c *gin.Context) {
	token, body, ok := buildImageWorkshopGenerationBody(c)
	if !ok {
		return
	}

	relayCtx, recorder, err := buildImageWorkshopAsyncContext(c, token, body)
	if relayCtx != nil {
		defer common.CleanupBodyStorage(relayCtx)
	}
	if err != nil {
		common.ApiErrorMsg(c, imageWorkshopRelayErrorMessage(recorder, err))
		return
	}

	task, submitErr := enqueueAsyncImageGeneration(relayCtx)
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
	resp, err := service.BuildImageTaskPollResponse(task)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, resp.Data)
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
	var payload map[string]json.RawMessage
	if err = common.Unmarshal(body, &payload); err != nil {
		common.ApiError(c, err)
		return nil, nil, false
	}
	tokenIDRaw, ok := payload["token_id"]
	if !ok {
		common.ApiErrorMsg(c, "token_id is required")
		return nil, nil, false
	}
	var tokenID int
	if err = common.Unmarshal(tokenIDRaw, &tokenID); err != nil || tokenID <= 0 {
		common.ApiErrorMsg(c, "token_id is invalid")
		return nil, nil, false
	}
	token, err := model.GetTokenByIds(tokenID, c.GetInt("id"))
	if err != nil {
		common.ApiErrorMsg(c, "token not found")
		return nil, nil, false
	}

	delete(payload, "token_id")
	payload["response_format"] = json.RawMessage(`"b64_json"`)
	rewritten, err := common.Marshal(payload)
	if err != nil {
		common.ApiError(c, err)
		return nil, nil, false
	}
	return token, rewritten, true
}

func buildImageWorkshopAsyncContext(parent *gin.Context, token *model.Token, body []byte) (*gin.Context, *httptest.ResponseRecorder, error) {
	recorder := httptest.NewRecorder()
	relayCtx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations?async=true", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer sk-"+token.Key)
	copyImageWorkshopClientHeaders(parent, req)
	relayCtx.Request = req

	middleware.TokenAuth()(relayCtx)
	if relayCtx.IsAborted() {
		return relayCtx, recorder, errImageWorkshopBridgeRejected
	}
	middleware.Distribute()(relayCtx)
	if relayCtx.IsAborted() {
		return relayCtx, recorder, errImageWorkshopBridgeRejected
	}
	return relayCtx, recorder, nil
}

var errImageWorkshopBridgeRejected = &imageWorkshopBridgeError{}

type imageWorkshopBridgeError struct{}

func (e *imageWorkshopBridgeError) Error() string {
	return "image workshop bridge request rejected"
}

func copyImageWorkshopClientHeaders(parent *gin.Context, req *http.Request) {
	if parent == nil || parent.Request == nil {
		return
	}
	if parent.Request.RemoteAddr != "" {
		req.RemoteAddr = parent.Request.RemoteAddr
	}
	for _, header := range []string{"X-Forwarded-For", "X-Real-IP", "CF-Connecting-IP", "Accept-Language"} {
		if value := parent.GetHeader(header); value != "" {
			req.Header.Set(header, value)
		}
	}
}

func imageWorkshopRelayErrorMessage(recorder *httptest.ResponseRecorder, err error) string {
	if recorder == nil {
		return err.Error()
	}
	body := strings.TrimSpace(recorder.Body.String())
	if body == "" {
		return err.Error()
	}
	var resp struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if unmarshalErr := common.Unmarshal([]byte(body), &resp); unmarshalErr == nil && strings.TrimSpace(resp.Error.Message) != "" {
		return resp.Error.Message
	}
	return body
}
