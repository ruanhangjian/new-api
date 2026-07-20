package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImageWorkshopCapabilityForModel(t *testing.T) {
	capability, ok := imageWorkshopCapabilityForModel("gpt-image-1.5", true)
	require.True(t, ok)
	assert.Equal(t, "auto", capability.DefaultQuality)
	assert.Equal(t, []string{"png", "jpeg", "webp"}, capability.OutputFormats)
	assert.Equal(t, 4, capability.MaxImages)
	assert.False(t, capability.SupportsTransparentBackground)

	capability, ok = imageWorkshopCapabilityForModel("dall-e-3", true)
	require.True(t, ok)
	assert.Equal(t, []string{"standard", "hd"}, capability.Qualities)
	assert.Empty(t, capability.OutputFormats)

	capability, ok = imageWorkshopCapabilityForModel("gpt-image-1", false)
	require.True(t, ok)
	assert.Equal(t, []string{"auto"}, capability.Sizes)
	assert.Empty(t, capability.OutputFormats)
	assert.Equal(t, 1, capability.MaxImages)

	_, ok = imageWorkshopCapabilityForModel("gpt-4o-mini", true)
	assert.False(t, ok)
}

func TestFindImageWorkshopModelCapability(t *testing.T) {
	capabilities := []ImageWorkshopModelCapability{{Model: "gpt-image-1"}}
	capability, ok := FindImageWorkshopModelCapability(capabilities, "gpt-image-1")
	require.True(t, ok)
	assert.Equal(t, "gpt-image-1", capability.Model)

	_, ok = FindImageWorkshopModelCapability(capabilities, "dall-e-3")
	assert.False(t, ok)
}
