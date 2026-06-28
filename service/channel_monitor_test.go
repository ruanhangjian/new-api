package service

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strconv"
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
