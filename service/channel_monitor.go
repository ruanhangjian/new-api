package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

const (
	channelMonitorRequestTimeout = 45 * time.Second
	channelMonitorPingTimeout    = 8 * time.Second
	channelMonitorDegradedAfter  = 6 * time.Second
)

type ChannelMonitorCheckResult struct {
	MonitorID     int    `json:"monitor_id"`
	Model         string `json:"model"`
	Status        string `json:"status"`
	LatencyMS     int    `json:"latency_ms"`
	PingLatencyMS int    `json:"ping_latency_ms"`
	Message       string `json:"message"`
	CheckedAt     int64  `json:"checked_at"`
}

func CalculateChannelMonitorAvailability(histories []model.ChannelMonitorHistory) float64 {
	if len(histories) == 0 {
		return 0
	}
	available := 0
	for _, history := range histories {
		if model.ChannelMonitorStatusIsAvailable(history.Status) {
			available++
		}
	}
	return float64(available) * 100 / float64(len(histories))
}

func AverageChannelMonitorLatency(histories []model.ChannelMonitorHistory) int {
	total := 0
	count := 0
	for _, history := range histories {
		if history.LatencyMS <= 0 {
			continue
		}
		total += history.LatencyMS
		count++
	}
	if count == 0 {
		return 0
	}
	return total / count
}

func CheckAndRecordChannelMonitor(ctx context.Context, monitor *model.ChannelMonitor) ([]ChannelMonitorCheckResult, error) {
	results := CheckChannelMonitor(ctx, monitor)
	histories := make([]model.ChannelMonitorHistory, 0, len(results))
	for _, result := range results {
		histories = append(histories, model.ChannelMonitorHistory{
			MonitorID:     result.MonitorID,
			Model:         result.Model,
			Status:        result.Status,
			LatencyMS:     result.LatencyMS,
			PingLatencyMS: result.PingLatencyMS,
			Message:       result.Message,
			CheckedAt:     result.CheckedAt,
		})
	}
	if err := model.InsertChannelMonitorHistories(histories); err != nil {
		return results, err
	}
	if err := model.UpdateChannelMonitorLastCheckedAt(monitor.Id, common.GetTimestamp()); err != nil {
		return results, err
	}
	return results, nil
}

func CheckChannelMonitor(ctx context.Context, monitor *model.ChannelMonitor) []ChannelMonitorCheckResult {
	models := append([]string{monitor.PrimaryModel}, model.ParseChannelMonitorExtraModels(monitor.ExtraModels)...)
	pingLatency := pingMonitorEndpoint(ctx, monitor.Endpoint)
	results := make([]ChannelMonitorCheckResult, 0, len(models))
	for _, modelName := range models {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			continue
		}
		results = append(results, checkSingleChannelMonitorModel(ctx, monitor, modelName, pingLatency))
	}
	return results
}

func checkSingleChannelMonitorModel(ctx context.Context, monitor *model.ChannelMonitor, modelName string, pingLatency int) ChannelMonitorCheckResult {
	checkedAt := common.GetTimestamp()
	start := time.Now()
	status := model.ChannelMonitorStatusOperational
	message := "OK"

	req, err := buildChannelMonitorRequest(ctx, monitor, modelName)
	if err != nil {
		return ChannelMonitorCheckResult{
			MonitorID:     monitor.Id,
			Model:         modelName,
			Status:        model.ChannelMonitorStatusError,
			LatencyMS:     0,
			PingLatencyMS: pingLatency,
			Message:       trimMonitorMessage(err.Error()),
			CheckedAt:     checkedAt,
		}
	}

	client := monitorHTTPClient(channelMonitorRequestTimeout)
	resp, err := client.Do(req)
	latency := int(time.Since(start).Milliseconds())
	if err != nil {
		status = model.ChannelMonitorStatusError
		message = err.Error()
	} else {
		defer CloseResponseBodyGracefully(resp)
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 4096))
		if readErr != nil {
			status = model.ChannelMonitorStatusError
			message = readErr.Error()
		} else if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
			status = model.ChannelMonitorStatusError
			message = fmt.Sprintf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		} else if len(bytes.TrimSpace(body)) == 0 {
			status = model.ChannelMonitorStatusFailed
			message = "empty response"
		} else if shouldValidateMonitorChallenge(monitor) && !monitorResponseContainsChallenge(body) {
			status = model.ChannelMonitorStatusFailed
			message = "challenge mismatch"
		} else if time.Duration(latency)*time.Millisecond >= channelMonitorDegradedAfter {
			status = model.ChannelMonitorStatusDegraded
			message = "slow response"
		}
	}

	return ChannelMonitorCheckResult{
		MonitorID:     monitor.Id,
		Model:         modelName,
		Status:        status,
		LatencyMS:     latency,
		PingLatencyMS: pingLatency,
		Message:       trimMonitorMessage(message),
		CheckedAt:     checkedAt,
	}
}

func monitorHTTPClient(timeout time.Duration) *http.Client {
	base := GetHttpClient()
	transport := http.DefaultTransport
	if base != nil && base.Transport != nil {
		transport = base.Transport
	}
	return &http.Client{
		Transport:     transport,
		Timeout:       timeout,
		CheckRedirect: monitorCheckRedirect,
	}
}

func monitorCheckRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 10 {
		return errors.New("stopped after 10 redirects")
	}
	return validateMonitorURL(req.URL.String())
}

func validateMonitorURL(urlStr string) error {
	fetchSetting := system_setting.GetFetchSetting()
	return common.ValidateURLWithFetchSetting(
		urlStr,
		fetchSetting.EnableSSRFProtection,
		fetchSetting.AllowPrivateIp,
		fetchSetting.DomainFilterMode,
		fetchSetting.IpFilterMode,
		fetchSetting.DomainList,
		fetchSetting.IpList,
		fetchSetting.AllowedPorts,
		fetchSetting.ApplyIPFilterForDomain,
	)
}

func pingMonitorEndpoint(ctx context.Context, endpoint string) int {
	if err := validateMonitorURL(endpoint); err != nil {
		return 0
	}
	reqCtx, cancel := context.WithTimeout(ctx, channelMonitorPingTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodHead, endpoint, nil)
	if err != nil {
		return 0
	}
	start := time.Now()
	resp, err := monitorHTTPClient(channelMonitorPingTimeout).Do(req)
	if err != nil && req.Method == http.MethodHead {
		req, reqErr := http.NewRequestWithContext(reqCtx, http.MethodGet, endpoint, nil)
		if reqErr != nil {
			return 0
		}
		resp, err = monitorHTTPClient(channelMonitorPingTimeout).Do(req)
	}
	if err != nil {
		return 0
	}
	defer CloseResponseBodyGracefully(resp)
	return int(time.Since(start).Milliseconds())
}

func buildChannelMonitorRequest(ctx context.Context, monitor *model.ChannelMonitor, modelName string) (*http.Request, error) {
	targetURL, body, err := buildMonitorRequestURLAndBody(monitor, modelName)
	if err != nil {
		return nil, err
	}
	if err := validateMonitorURL(targetURL); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	applyChannelMonitorAuthHeaders(req, monitor)
	applyChannelMonitorExtraHeaders(req, monitor.ExtraHeaders)
	return req, nil
}

func buildMonitorRequestURLAndBody(monitor *model.ChannelMonitor, modelName string) (string, string, error) {
	switch monitor.Provider {
	case model.ChannelMonitorProviderOpenAI:
		if monitor.APIMode == model.ChannelMonitorAPIModeResponses {
			body := map[string]any{
				"model": modelName,
				"input": "Reply with OK.",
			}
			return joinMonitorURL(monitor.Endpoint, "/v1/responses"), applyBodyOverride(body, monitor), nil
		}
		body := map[string]any{
			"model": modelName,
			"messages": []map[string]string{
				{"role": "user", "content": "Reply with OK."},
			},
			"max_tokens":  8,
			"temperature": 0,
			"stream":      false,
			"n":           1,
			"user":        "newapi-channel-monitor",
		}
		return joinMonitorURL(monitor.Endpoint, "/v1/chat/completions"), applyBodyOverride(body, monitor), nil
	case model.ChannelMonitorProviderAnthropic:
		body := map[string]any{
			"model": modelName,
			"messages": []map[string]string{
				{"role": "user", "content": "Reply with OK."},
			},
			"max_tokens": 8,
		}
		return joinMonitorURL(monitor.Endpoint, "/v1/messages"), applyBodyOverride(body, monitor), nil
	case model.ChannelMonitorProviderGemini:
		body := map[string]any{
			"contents": []map[string]any{
				{
					"parts": []map[string]string{
						{"text": "Reply with OK."},
					},
				},
			},
		}
		escapedModel := url.PathEscape(modelName)
		target := joinMonitorURL(monitor.Endpoint, "/v1beta/models/"+escapedModel+":generateContent")
		separator := "?"
		if strings.Contains(target, "?") {
			separator = "&"
		}
		target += separator + "key=" + url.QueryEscape(monitor.APIKey)
		return target, applyBodyOverride(body, monitor), nil
	default:
		return "", "", fmt.Errorf("unsupported provider: %s", monitor.Provider)
	}
}

func shouldValidateMonitorChallenge(monitor *model.ChannelMonitor) bool {
	return monitor.BodyOverrideMode != model.ChannelMonitorBodyOverrideReplace
}

func monitorResponseContainsChallenge(body []byte) bool {
	return strings.Contains(strings.ToLower(string(body)), "ok")
}

func applyChannelMonitorAuthHeaders(req *http.Request, monitor *model.ChannelMonitor) {
	switch monitor.Provider {
	case model.ChannelMonitorProviderAnthropic:
		req.Header.Set("x-api-key", monitor.APIKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	case model.ChannelMonitorProviderGemini:
		// Gemini API key is passed in the query string.
	default:
		req.Header.Set("Authorization", "Bearer "+monitor.APIKey)
	}
}

func applyChannelMonitorExtraHeaders(req *http.Request, value string) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	headers := map[string]any{}
	if err := common.UnmarshalJsonStr(value, &headers); err != nil {
		return
	}
	for key, raw := range headers {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		req.Header.Set(key, fmt.Sprint(raw))
	}
}

func applyBodyOverride(defaultBody map[string]any, monitor *model.ChannelMonitor) string {
	if monitor.BodyOverrideMode == model.ChannelMonitorBodyOverrideReplace && strings.TrimSpace(monitor.BodyOverride) != "" {
		return monitor.BodyOverride
	}
	if monitor.BodyOverrideMode == model.ChannelMonitorBodyOverrideMerge && strings.TrimSpace(monitor.BodyOverride) != "" {
		override := map[string]any{}
		if err := common.UnmarshalJsonStr(monitor.BodyOverride, &override); err == nil {
			for key, value := range override {
				defaultBody[key] = value
			}
		}
	}
	data, err := common.Marshal(defaultBody)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func joinMonitorURL(endpoint string, path string) string {
	return strings.TrimRight(endpoint, "/") + path
}

func trimMonitorMessage(message string) string {
	message = strings.TrimSpace(message)
	if len(message) <= 500 {
		return message
	}
	return message[:500]
}
