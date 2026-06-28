package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestIsChannelMonitorEnabledDefaultsToTrue(t *testing.T) {
	originalMap := common.OptionMap
	common.OptionMap = map[string]string{}
	defer func() {
		common.OptionMap = originalMap
	}()

	if !IsChannelMonitorEnabled() {
		t.Fatal("expected channel monitor to be enabled by default")
	}
}

func TestIsChannelMonitorEnabledReadsOptionMap(t *testing.T) {
	originalMap := common.OptionMap
	common.OptionMap = map[string]string{
		ChannelMonitorEnabledOptionKey: "false",
	}
	defer func() {
		common.OptionMap = originalMap
	}()

	if IsChannelMonitorEnabled() {
		t.Fatal("expected channel monitor to be disabled when option is false")
	}
}

func TestParseChannelMonitorExtraModelsReturnsEmptySliceForBlankValue(t *testing.T) {
	models := ParseChannelMonitorExtraModels("")

	if models == nil {
		t.Fatal("expected empty slice, got nil")
	}
	if len(models) != 0 {
		t.Fatalf("expected no models, got %d", len(models))
	}
}
