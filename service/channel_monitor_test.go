package service

import (
	"math"
	"net/http"
	"net/http/httptest"
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

func TestCheckChannelMonitorFailsWhenChallengeMissing(t *testing.T) {
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
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"hello"}}]}`))
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
