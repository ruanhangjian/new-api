package system_setting

import "testing"

func TestThemeSettingsDefaultFrontend(t *testing.T) {
	if got := GetThemeSettings().Frontend; got != "default" {
		t.Fatalf("GetThemeSettings().Frontend = %q, want %q", got, "default")
	}
}
