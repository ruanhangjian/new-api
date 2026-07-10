package common

import "testing"

func TestDefaultThemeIsDefaultFrontend(t *testing.T) {
	if got := GetTheme(); got != "default" {
		t.Fatalf("GetTheme() = %q, want %q", got, "default")
	}
}

func TestSetThemeAcceptsClassicAndRejectsInvalidValues(t *testing.T) {
	original := GetTheme()
	t.Cleanup(func() {
		SetTheme(original)
	})

	SetTheme("classic")
	if got := GetTheme(); got != "classic" {
		t.Fatalf("GetTheme() after SetTheme(classic) = %q, want %q", got, "classic")
	}

	SetTheme("unknown")
	if got := GetTheme(); got != "classic" {
		t.Fatalf("GetTheme() after invalid SetTheme = %q, want unchanged %q", got, "classic")
	}
}
