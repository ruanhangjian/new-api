package service

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
)

const (
	ImageWorkshopResolutionTier1K = "1K"
	ImageWorkshopResolutionTier2K = "2K"
	ImageWorkshopResolutionTier4K = "4K"

	ImageWorkshopResolutionSourceRequest = "request_size"
	ImageWorkshopResolutionSourceDefault = "default"
	ImageWorkshopResolutionRatioKey      = "image_resolution"
	ImageWorkshopResolutionRatio1K       = 1.0
	ImageWorkshopResolutionRatio2K       = 1.5
	ImageWorkshopResolutionRatio4K       = 2.0

	ImageWorkshopPriceSourceChannelOverride = "channel_override"
	ImageWorkshopPriceSourceModelDefault    = "model_default"
	ImageWorkshopPriceSourceFixedMultiplier = "fixed_price_multiplier"
)

// ImageWorkshopResolutionBilling describes the tier inferred from the size
// that NewAPI actually sends upstream. Output pixels are intentionally not
// part of this decision because upstream billing is request-tier based when
// the returned image does not include reliable dimensions.
type ImageWorkshopResolutionBilling struct {
	Tier       string
	Multiplier float64
	Source     string
}

func ResolveImageWorkshopResolutionBilling(size string) ImageWorkshopResolutionBilling {
	normalized := strings.ToLower(strings.TrimSpace(size))
	switch normalized {
	case ImageWorkshopResolutionTier1K, "1k":
		return ImageWorkshopResolutionBilling{Tier: ImageWorkshopResolutionTier1K, Multiplier: ImageWorkshopResolutionRatio1K, Source: ImageWorkshopResolutionSourceRequest}
	case ImageWorkshopResolutionTier2K, "2k":
		return ImageWorkshopResolutionBilling{Tier: ImageWorkshopResolutionTier2K, Multiplier: ImageWorkshopResolutionRatio2K, Source: ImageWorkshopResolutionSourceRequest}
	case ImageWorkshopResolutionTier4K, "4k":
		return ImageWorkshopResolutionBilling{Tier: ImageWorkshopResolutionTier4K, Multiplier: ImageWorkshopResolutionRatio4K, Source: ImageWorkshopResolutionSourceRequest}
	}

	parts := strings.Split(strings.ReplaceAll(strings.ReplaceAll(normalized, "×", "x"), " ", ""), "x")
	if len(parts) == 2 {
		width, widthErr := strconv.Atoi(parts[0])
		height, heightErr := strconv.Atoi(parts[1])
		if widthErr == nil && heightErr == nil && width > 0 && height > 0 {
			maxEdge := width
			if height > maxEdge {
				maxEdge = height
			}
			switch {
			case maxEdge <= 1024:
				return ImageWorkshopResolutionBilling{Tier: ImageWorkshopResolutionTier1K, Multiplier: ImageWorkshopResolutionRatio1K, Source: ImageWorkshopResolutionSourceRequest}
			case maxEdge <= 2048:
				return ImageWorkshopResolutionBilling{Tier: ImageWorkshopResolutionTier2K, Multiplier: ImageWorkshopResolutionRatio2K, Source: ImageWorkshopResolutionSourceRequest}
			default:
				return ImageWorkshopResolutionBilling{Tier: ImageWorkshopResolutionTier4K, Multiplier: ImageWorkshopResolutionRatio4K, Source: ImageWorkshopResolutionSourceRequest}
			}
		}
	}

	// The upstream compatibility path treats auto and missing sizes as 2K.
	return ImageWorkshopResolutionBilling{
		Tier:       ImageWorkshopResolutionTier2K,
		Multiplier: ImageWorkshopResolutionRatio2K,
		Source:     ImageWorkshopResolutionSourceDefault,
	}
}

// ApplyImageWorkshopResolutionBilling uses a configured tier price when one
// exists, otherwise it applies the fallback multiplier to fixed-price billing.
// Token-based image billing already receives upstream usage, so multiplying it
// again would count resolution twice.
func ApplyImageWorkshopResolutionBilling(priceData *types.PriceData, billing ImageWorkshopResolutionBilling, modelName string, channelIDs ...int) {
	if priceData == nil {
		return
	}
	channelID := 0
	if len(channelIDs) > 0 {
		channelID = channelIDs[0]
	}
	priceData.ImageResolutionTier = billing.Tier
	priceData.ImagePriceChannelID = channelID
	if price, ok := ratio_setting.GetImageResolutionChannelPrice(modelName, channelID, billing.Tier); ok {
		priceData.ImagePriceSource = ImageWorkshopPriceSourceChannelOverride
		priceData.UsePrice = true
		priceData.ModelPrice = price
		priceData.QuotaToPreConsume = common.QuotaFromFloat(price * common.QuotaPerUnit * priceData.GroupRatioInfo.GroupRatio)
		priceData.FreeModel = price == 0 || priceData.GroupRatioInfo.GroupRatio == 0
		return
	}
	if price, ok := ratio_setting.GetImageResolutionPrice(modelName, billing.Tier); ok {
		priceData.ImagePriceSource = ImageWorkshopPriceSourceModelDefault
		priceData.UsePrice = true
		priceData.ModelPrice = price
		priceData.QuotaToPreConsume = common.QuotaFromFloat(price * common.QuotaPerUnit * priceData.GroupRatioInfo.GroupRatio)
		priceData.FreeModel = price == 0 || priceData.GroupRatioInfo.GroupRatio == 0
		return
	}
	if !priceData.UsePrice || billing.Multiplier == 1 {
		return
	}
	priceData.ImagePriceSource = ImageWorkshopPriceSourceFixedMultiplier
	priceData.AddOtherRatio(ImageWorkshopResolutionRatioKey, billing.Multiplier)
	priceData.QuotaToPreConsume = common.QuotaFromFloat(float64(priceData.QuotaToPreConsume) * billing.Multiplier)
}
