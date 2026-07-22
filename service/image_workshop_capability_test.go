package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImageWorkshopCapabilityForModel(t *testing.T) {
	capability, ok := imageWorkshopCapabilityForModel("gpt-image-2", false)
	require.True(t, ok)
	assert.Len(t, capability.Sizes, 25)
	assert.Contains(t, capability.Sizes, "1280x720")
	assert.Contains(t, capability.Sizes, "2048x2048")
	assert.Contains(t, capability.Sizes, "3840x2160")
	assert.Equal(t, []string{"1K", "2K", "4K"}, capability.SizeTiers)
	assert.Equal(t, []string{"1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"}, capability.AspectRatios)
	assert.True(t, capability.SupportsCustomSize)
	require.NotNil(t, capability.SizeConstraints)
	assert.Equal(t, 16, capability.SizeConstraints.Multiple)
	assert.EqualValues(t, 8_294_400, capability.SizeConstraints.MaxPixels)
	assert.Equal(t, []string{"auto", "low", "medium", "high"}, capability.Qualities)
	assert.Equal(t, []string{"png", "jpeg", "webp"}, capability.OutputFormats)
	assert.Equal(t, 6, capability.MaxImages)
	assert.True(t, capability.SupportsReferenceImages)
	assert.Equal(t, 9, capability.MaxReferenceImages)

	capability, ok = imageWorkshopCapabilityForModel("gpt-image-1.5", true)
	require.True(t, ok)
	assert.Equal(t, "auto", capability.DefaultQuality)
	assert.Equal(t, []string{"png", "jpeg", "webp"}, capability.OutputFormats)
	assert.Equal(t, 4, capability.MaxImages)
	assert.False(t, capability.SupportsReferenceImages)
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

func TestNormalizeImageWorkshopSize(t *testing.T) {
	capability, ok := imageWorkshopCapabilityForModel("gpt-image-2", false)
	require.True(t, ok)

	tests := []struct {
		name      string
		requested string
		want      string
	}{
		{name: "auto", requested: "auto", want: "auto"},
		{name: "2k preset", requested: "2560x1440", want: "2560x1440"},
		{name: "4k preset", requested: "3840x2160", want: "3840x2160"},
		{name: "custom dimensions align to multiple", requested: "1033x1522", want: "1040x1520"},
		{name: "oversized square is constrained", requested: "5000x5000", want: "2880x2880"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := NormalizeImageWorkshopSize(capability, test.requested)
			require.NoError(t, err)
			assert.Equal(t, test.want, actual)
		})
	}

	_, err := NormalizeImageWorkshopSize(capability, "wide")
	require.ErrorContains(t, err, "widthxheight")

	legacyCapability, ok := imageWorkshopCapabilityForModel("gpt-image-1", true)
	require.True(t, ok)
	_, err = NormalizeImageWorkshopSize(legacyCapability, "2048x2048")
	require.ErrorContains(t, err, "not supported")
}

func TestFindImageWorkshopModelCapability(t *testing.T) {
	capabilities := []ImageWorkshopModelCapability{{Model: "gpt-image-1"}}
	capability, ok := FindImageWorkshopModelCapability(capabilities, "gpt-image-1")
	require.True(t, ok)
	assert.Equal(t, "gpt-image-1", capability.Model)

	_, ok = FindImageWorkshopModelCapability(capabilities, "dall-e-3")
	assert.False(t, ok)
}
