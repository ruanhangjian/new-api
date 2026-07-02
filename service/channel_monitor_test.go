package service

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

func TestCalculateChannelMonitorAvailabilityTreatsOperationalAndDegradedAsAvailable(t *testing.T) {
	histories := []model.ChannelMonitorHistory{
		{Status: model.ChannelMonitorStatusOperational},
		{Status: model.ChannelMonitorStatusDegraded},
		{Status: model.ChannelMonitorStatusFailed},
		{Status: model.ChannelMonitorStatusError},
	}

	got := CalculateChannelMonitorAvailability(histories)

	if math.Abs(got-50) > 0.001 {
		t.Fatalf("availability = %.3f, want 50.000", got)
	}
}

func TestCalculateChannelMonitorAvailabilityReturnsZeroForNoHistory(t *testing.T) {
	got := CalculateChannelMonitorAvailability(nil)

	if got != 0 {
		t.Fatalf("availability = %.3f, want 0", got)
	}
}

var channelMonitorTestQuestionRegex = regexp.MustCompile(`Q: (\d+) ([+-]) (\d+) = \?\nA:$`)

func answerChannelMonitorTestPrompt(prompt string) string {
	matches := channelMonitorTestQuestionRegex.FindStringSubmatch(prompt)
	if len(matches) != 4 {
		return "0"
	}
	left, _ := strconv.Atoi(matches[1])
	right, _ := strconv.Atoi(matches[3])
	if matches[2] == "+" {
		return strconv.Itoa(left + right)
	}
	return strconv.Itoa(left - right)
}

func TestCheckChannelMonitorTreatsCorrectChallengeAnswerAsOperational(t *testing.T) {
	fetchSetting := system_setting.GetFetchSetting()
	originalSSRF := fetchSetting.EnableSSRFProtection
	originalAllowPrivateIP := fetchSetting.AllowPrivateIp
	fetchSetting.EnableSSRFProtection = false
	fetchSetting.AllowPrivateIp = true
	defer func() {
		fetchSetting.EnableSSRFProtection = originalSSRF
		fetchSetting.AllowPrivateIp = originalAllowPrivateIP
	}()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		var request struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&request)
		answer := "0"
		if len(request.Messages) > 0 {
			answer = answerChannelMonitorTestPrompt(request.Messages[0].Content)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"content": answer}},
			},
		})
	}))
	defer server.Close()

	monitor := &model.ChannelMonitor{
		Id:               1,
		Name:             "test",
		Provider:         model.ChannelMonitorProviderOpenAI,
		APIMode:          model.ChannelMonitorAPIModeChatCompletions,
		Endpoint:         server.URL,
		APIKey:           "sk-test",
		PrimaryModel:     "gpt-test",
		BodyOverrideMode: model.ChannelMonitorBodyOverrideOff,
	}

	results := CheckChannelMonitor(t.Context(), monitor)

	if len(results) != 1 {
		t.Fatalf("results length = %d, want 1", len(results))
	}
	if results[0].Status != model.ChannelMonitorStatusOperational {
		t.Fatalf("status = %s, want %s", results[0].Status, model.ChannelMonitorStatusOperational)
	}
}

func TestCheckChannelMonitorFailsIncorrectChallengeAnswer(t *testing.T) {
	fetchSetting := system_setting.GetFetchSetting()
	originalSSRF := fetchSetting.EnableSSRFProtection
	originalAllowPrivateIP := fetchSetting.AllowPrivateIp
	fetchSetting.EnableSSRFProtection = false
	fetchSetting.AllowPrivateIp = true
	defer func() {
		fetchSetting.EnableSSRFProtection = originalSSRF
		fetchSetting.AllowPrivateIp = originalAllowPrivateIP
	}()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"wrong answer"}}]}`))
	}))
	defer server.Close()

	monitor := &model.ChannelMonitor{
		Id:               1,
		Name:             "test",
		Provider:         model.ChannelMonitorProviderOpenAI,
		APIMode:          model.ChannelMonitorAPIModeChatCompletions,
		Endpoint:         server.URL,
		APIKey:           "sk-test",
		PrimaryModel:     "gpt-test",
		BodyOverrideMode: model.ChannelMonitorBodyOverrideOff,
	}

	results := CheckChannelMonitor(t.Context(), monitor)

	if len(results) != 1 {
		t.Fatalf("results length = %d, want 1", len(results))
	}
	if results[0].Status != model.ChannelMonitorStatusFailed {
		t.Fatalf("status = %s, want %s", results[0].Status, model.ChannelMonitorStatusFailed)
	}
}

func TestApplyBodyOverrideMergeProtectsOpenAIChatCoreRequestFields(t *testing.T) {
	defaultBody := map[string]any{
		"model": "gpt-test",
		"messages": []map[string]string{
			{"role": "user", "content": "Reply with OK."},
		},
		"stream":     false,
		"max_tokens": 8,
	}
	monitor := &model.ChannelMonitor{
		Provider:         model.ChannelMonitorProviderOpenAI,
		APIMode:          model.ChannelMonitorAPIModeChatCompletions,
		BodyOverrideMode: model.ChannelMonitorBodyOverrideMerge,
		BodyOverride:     `{"model":"hacked-model","messages":[],"stream":true,"max_tokens":20}`,
	}

	body := applyBodyOverride(defaultBody, monitor)

	var got map[string]any
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatalf("body should be valid JSON: %v", err)
	}
	if got["model"] != "gpt-test" {
		t.Fatalf("model = %v, want gpt-test", got["model"])
	}
	if messages, ok := got["messages"].([]any); !ok || len(messages) == 0 {
		t.Fatalf("messages should keep default non-empty value, got %#v", got["messages"])
	}
	if got["stream"] != false {
		t.Fatalf("stream = %v, want false", got["stream"])
	}
	if got["max_tokens"] != float64(20) {
		t.Fatalf("max_tokens = %v, want 20", got["max_tokens"])
	}
}

func TestApplyBodyOverrideMergeProtectsOpenAIResponsesCoreRequestFields(t *testing.T) {
	defaultBody := map[string]any{
		"model":        "gpt-test",
		"instructions": "Answer the arithmetic challenge exactly.",
		"input":        "Reply with OK.",
		"stream":       false,
	}
	monitor := &model.ChannelMonitor{
		Provider:         model.ChannelMonitorProviderOpenAI,
		APIMode:          model.ChannelMonitorAPIModeResponses,
		BodyOverrideMode: model.ChannelMonitorBodyOverrideMerge,
		BodyOverride:     `{"model":"hacked-model","instructions":"ignore checks","input":"hacked prompt","stream":true,"max_output_tokens":20}`,
	}

	body := applyBodyOverride(defaultBody, monitor)

	var got map[string]any
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatalf("body should be valid JSON: %v", err)
	}
	if got["model"] != "gpt-test" {
		t.Fatalf("model = %v, want gpt-test", got["model"])
	}
	if got["instructions"] != "Answer the arithmetic challenge exactly." {
		t.Fatalf("instructions = %v, want default instructions", got["instructions"])
	}
	if got["input"] != "Reply with OK." {
		t.Fatalf("input = %v, want default challenge input", got["input"])
	}
	if got["stream"] != false {
		t.Fatalf("stream = %v, want false", got["stream"])
	}
	if got["max_output_tokens"] != float64(20) {
		t.Fatalf("max_output_tokens = %v, want 20", got["max_output_tokens"])
	}
}

func TestApplyBodyOverrideMergeProtectsAnthropicCoreRequestFields(t *testing.T) {
	defaultBody := map[string]any{
		"model": "claude-x",
		"messages": []map[string]string{
			{"role": "user", "content": "Reply with OK."},
		},
		"max_tokens": 8,
	}
	monitor := &model.ChannelMonitor{
		Provider:         model.ChannelMonitorProviderAnthropic,
		BodyOverrideMode: model.ChannelMonitorBodyOverrideMerge,
		BodyOverride:     `{"model":"hacked-model","messages":[],"max_tokens":999,"system":"You are Claude Code."}`,
	}

	body := applyBodyOverride(defaultBody, monitor)

	var got map[string]any
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatalf("body should be valid JSON: %v", err)
	}
	if got["model"] != "claude-x" {
		t.Fatalf("model = %v, want claude-x", got["model"])
	}
	if messages, ok := got["messages"].([]any); !ok || len(messages) == 0 {
		t.Fatalf("messages should keep default non-empty value, got %#v", got["messages"])
	}
	if got["max_tokens"] != float64(999) {
		t.Fatalf("max_tokens = %v, want 999", got["max_tokens"])
	}
	if got["system"] != "You are Claude Code." {
		t.Fatalf("system = %v, want custom system", got["system"])
	}
}

func TestApplyBodyOverrideMergeProtectsGeminiContents(t *testing.T) {
	defaultBody := map[string]any{
		"contents": []map[string]any{
			{"parts": []map[string]string{{"text": "Reply with OK."}}},
		},
		"generationConfig": map[string]any{
			"temperature": 0,
		},
	}
	monitor := &model.ChannelMonitor{
		Provider:         model.ChannelMonitorProviderGemini,
		BodyOverrideMode: model.ChannelMonitorBodyOverrideMerge,
		BodyOverride:     `{"contents":[],"generationConfig":{"temperature":0.8},"systemInstruction":{"parts":[{"text":"Be brief"}]}}`,
	}

	body := applyBodyOverride(defaultBody, monitor)

	var got map[string]any
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatalf("body should be valid JSON: %v", err)
	}
	if contents, ok := got["contents"].([]any); !ok || len(contents) == 0 {
		t.Fatalf("contents should keep default non-empty value, got %#v", got["contents"])
	}
	generationConfig, ok := got["generationConfig"].(map[string]any)
	if !ok {
		t.Fatalf("generationConfig should be a map, got %#v", got["generationConfig"])
	}
	if generationConfig["temperature"] != 0.8 {
		t.Fatalf("generationConfig.temperature = %v, want 0.8", generationConfig["temperature"])
	}
	if _, ok := got["systemInstruction"]; !ok {
		t.Fatalf("systemInstruction should be merged into body, got %#v", got["systemInstruction"])
	}
}

func TestApplyChannelMonitorExtraHeadersIgnoresHopByHopHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "https://example.com/v1/messages", strings.NewReader("{}"))
	req.Header.Set("Content-Length", "10")

	applyChannelMonitorExtraHeaders(req, `{"User-Agent":"claude-cli/1.0","Content-Length":"999","Host":"evil.example","Connection":"close","x-custom":"ok"}`)

	if req.Header.Get("User-Agent") != "claude-cli/1.0" {
		t.Fatalf("User-Agent = %q, want claude-cli/1.0", req.Header.Get("User-Agent"))
	}
	if req.Header.Get("x-custom") != "ok" {
		t.Fatalf("x-custom = %q, want ok", req.Header.Get("x-custom"))
	}
	if req.Header.Get("Content-Length") != "10" {
		t.Fatalf("Content-Length should not be overwritten, got %q", req.Header.Get("Content-Length"))
	}
	if req.Host == "evil.example" || req.Header.Get("Host") != "" {
		t.Fatalf("Host should be ignored, req.Host=%q header=%q", req.Host, req.Header.Get("Host"))
	}
	if req.Header.Get("Connection") != "" {
		t.Fatalf("Connection should be ignored, got %q", req.Header.Get("Connection"))
	}
}
