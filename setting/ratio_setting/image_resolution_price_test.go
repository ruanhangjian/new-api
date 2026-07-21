package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateImageResolutionPriceRequiresCompleteValidTiers(t *testing.T) {
	require.NoError(t, UpdateImageResolutionPriceByJSONString(`{}`))
	t.Cleanup(func() {
		require.NoError(t, UpdateImageResolutionPriceByJSONString(`{}`))
	})

	err := UpdateImageResolutionPriceByJSONString(`{"gpt-image-2":{"1K":0.06,"2K":0.08}}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "4K")
	_, ok := GetImageResolutionPrice("gpt-image-2", "1K")
	assert.False(t, ok)

	err = UpdateImageResolutionPriceByJSONString(`{"gpt-image-2":{"1K":0.06,"2K":-1,"4K":0.1}}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "2K")
}

func TestGetImageResolutionPrice(t *testing.T) {
	require.NoError(t, UpdateImageResolutionPriceByJSONString(`{
		"gpt-image-2": {"1K": 0.06, "2K": 0.08, "4K": 0.1}
	}`))
	t.Cleanup(func() {
		require.NoError(t, UpdateImageResolutionPriceByJSONString(`{}`))
	})

	price, ok := GetImageResolutionPrice("gpt-image-2", "2k")
	require.True(t, ok)
	assert.Equal(t, 0.08, price)

	_, ok = GetImageResolutionPrice("other-model", "2K")
	assert.False(t, ok)
}
