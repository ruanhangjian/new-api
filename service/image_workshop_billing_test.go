package service

import (
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/assert"
)

func TestResolveImageWorkshopResolutionBilling(t *testing.T) {
	tests := []struct {
		name       string
		size       string
		wantTier   string
		wantRatio  float64
		wantSource string
	}{
		{name: "1k max edge", size: "1024x768", wantTier: "1K", wantRatio: 1, wantSource: ImageWorkshopResolutionSourceRequest},
		{name: "2k max edge", size: "1536x1024", wantTier: "2K", wantRatio: 1.5, wantSource: ImageWorkshopResolutionSourceRequest},
		{name: "4k max edge", size: "2304x3456", wantTier: "4K", wantRatio: 2, wantSource: ImageWorkshopResolutionSourceRequest},
		{name: "auto defaults to 2k", size: "auto", wantTier: "2K", wantRatio: 1.5, wantSource: ImageWorkshopResolutionSourceDefault},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual := ResolveImageWorkshopResolutionBilling(test.size)
			assert.Equal(t, test.wantTier, actual.Tier)
			assert.Equal(t, test.wantRatio, actual.Multiplier)
			assert.Equal(t, test.wantSource, actual.Source)
		})
	}
}

func TestApplyImageWorkshopResolutionBillingOnlyChangesFixedPrice(t *testing.T) {
	billing := ResolveImageWorkshopResolutionBilling("2304x3456")
	fixed := &types.PriceData{UsePrice: true, QuotaToPreConsume: 100}
	ApplyImageWorkshopResolutionBilling(fixed, billing)
	assert.Equal(t, 200, fixed.QuotaToPreConsume)
	assert.Equal(t, 2.0, fixed.OtherRatios()[ImageWorkshopResolutionRatioKey])

	ratio := &types.PriceData{UsePrice: false, QuotaToPreConsume: 100}
	ApplyImageWorkshopResolutionBilling(ratio, billing)
	assert.Equal(t, 100, ratio.QuotaToPreConsume)
	assert.Empty(t, ratio.OtherRatios())
}
