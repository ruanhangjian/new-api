package service

import (
	"errors"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

type ImageWorkshopSizeConstraints struct {
	Multiple       int     `json:"multiple"`
	MaxEdge        int     `json:"max_edge"`
	MaxAspectRatio float64 `json:"max_aspect_ratio"`
	MinPixels      int64   `json:"min_pixels"`
	MaxPixels      int64   `json:"max_pixels"`
}

type ImageWorkshopModelCapability struct {
	Model                         string                        `json:"model"`
	Sizes                         []string                      `json:"sizes"`
	SizeTiers                     []string                      `json:"size_tiers,omitempty"`
	AspectRatios                  []string                      `json:"aspect_ratios,omitempty"`
	SupportsCustomSize            bool                          `json:"supports_custom_size"`
	SizeConstraints               *ImageWorkshopSizeConstraints `json:"size_constraints,omitempty"`
	Qualities                     []string                      `json:"qualities"`
	OutputFormats                 []string                      `json:"output_formats"`
	DefaultSize                   string                        `json:"default_size"`
	DefaultQuality                string                        `json:"default_quality"`
	DefaultOutputFormat           string                        `json:"default_output_format,omitempty"`
	MaxImages                     int                           `json:"max_images"`
	SupportsTransparentBackground bool                          `json:"supports_transparent_background"`
}

var imageWorkshopSizePattern = regexp.MustCompile(`^([0-9]{1,9})[xX×]([0-9]{1,9})$`)

var gptImage2PresetSizes = []string{
	"1024x1024", "1536x1024", "1024x1536", "1280x720", "720x1280", "1024x768", "768x1024", "1280x544",
	"2048x2048", "2160x1440", "1440x2160", "2560x1440", "1440x2560", "2048x1536", "1536x2048", "2560x1088",
	"2880x2880", "3456x2304", "2304x3456", "3840x2160", "2160x3840", "3200x2400", "2400x3200", "3840x1600",
}

func GetImageWorkshopModelCapabilities(userID int, token *model.Token) ([]ImageWorkshopModelCapability, error) {
	user, err := model.GetUserCache(userID)
	if err != nil {
		return nil, err
	}

	groups := []string{user.Group}
	if token.Group == "auto" {
		groups = GetUserAutoGroup(user.Group)
	} else if token.Group != "" {
		groups = []string{token.Group}
	}

	candidates, err := model.GetImageWorkshopChannelCandidates(groups)
	if err != nil {
		return nil, err
	}
	candidatesByModel := make(map[string][]model.ImageWorkshopChannelCandidate)
	for _, candidate := range candidates {
		candidatesByModel[candidate.Model] = append(candidatesByModel[candidate.Model], candidate)
	}

	limits := token.GetModelLimitsMap()
	capabilities := make([]ImageWorkshopModelCapability, 0, len(candidatesByModel))
	for modelName, modelCandidates := range candidatesByModel {
		if token.ModelLimitsEnabled {
			matchedName := ratio_setting.FormatMatchingModelName(modelName)
			if !limits[modelName] && !limits[matchedName] {
				continue
			}
		}
		fullCapability := true
		for _, candidate := range modelCandidates {
			if !isCertifiedImageWorkshopChannel(candidate) {
				fullCapability = false
				break
			}
		}
		capability, ok := imageWorkshopCapabilityForModel(modelName, fullCapability)
		if ok {
			capabilities = append(capabilities, capability)
		}
	}

	sort.Slice(capabilities, func(i, j int) bool {
		return capabilities[i].Model < capabilities[j].Model
	})
	return capabilities, nil
}

func ValidateImageWorkshopOptionsToken(userID int, token *model.Token) error {
	if token == nil || token.UserId != userID {
		return errors.New("token not found")
	}
	if token.Status != common.TokenStatusEnabled {
		return errors.New("token is disabled")
	}
	if token.ExpiredTime != -1 && token.ExpiredTime < time.Now().Unix() {
		return errors.New("token is expired")
	}
	if !token.UnlimitedQuota && token.RemainQuota <= 0 {
		return errors.New("token quota is exhausted")
	}
	if token.Group != "" && token.Group != "auto" {
		user, err := model.GetUserCache(userID)
		if err != nil {
			return err
		}
		if !GroupInUserUsableGroups(user.Group, token.Group) {
			return errors.New("token group is not available")
		}
	}
	return nil
}

func FindImageWorkshopModelCapability(capabilities []ImageWorkshopModelCapability, modelName string) (ImageWorkshopModelCapability, bool) {
	for _, capability := range capabilities {
		if capability.Model == modelName {
			return capability, true
		}
	}
	return ImageWorkshopModelCapability{}, false
}

func NormalizeImageWorkshopSize(capability ImageWorkshopModelCapability, requested string) (string, error) {
	size := strings.ToLower(strings.TrimSpace(requested))
	if size == "" {
		size = capability.DefaultSize
	}
	if containsImageWorkshopCapabilityOption(capability.Sizes, size) {
		return size, nil
	}
	if !capability.SupportsCustomSize || capability.SizeConstraints == nil {
		return "", fmt.Errorf("size is not supported by model %s", capability.Model)
	}

	matches := imageWorkshopSizePattern.FindStringSubmatch(size)
	if len(matches) != 3 {
		return "", fmt.Errorf("size must use widthxheight format for model %s", capability.Model)
	}
	width, widthErr := strconv.ParseInt(matches[1], 10, 64)
	height, heightErr := strconv.ParseInt(matches[2], 10, 64)
	if widthErr != nil || heightErr != nil || width <= 0 || height <= 0 {
		return "", fmt.Errorf("size must contain positive dimensions for model %s", capability.Model)
	}

	normalizedWidth, normalizedHeight := normalizeImageWorkshopDimensions(width, height, *capability.SizeConstraints)
	return fmt.Sprintf("%dx%d", normalizedWidth, normalizedHeight), nil
}

func normalizeImageWorkshopDimensions(width int64, height int64, constraints ImageWorkshopSizeConstraints) (int64, int64) {
	multiple := int64(constraints.Multiple)
	maxEdge := int64(constraints.MaxEdge)
	width = roundImageWorkshopDimension(width, multiple)
	height = roundImageWorkshopDimension(height, multiple)

	scaleToFit := func(scale float64) {
		width = floorImageWorkshopDimension(float64(width)*scale, multiple)
		height = floorImageWorkshopDimension(float64(height)*scale, multiple)
	}
	scaleToFill := func(scale float64) {
		width = ceilImageWorkshopDimension(float64(width)*scale, multiple)
		height = ceilImageWorkshopDimension(float64(height)*scale, multiple)
	}

	for range 4 {
		if edge := max(width, height); edge > maxEdge {
			scaleToFit(float64(maxEdge) / float64(edge))
		}

		if float64(width)/float64(height) > constraints.MaxAspectRatio {
			width = floorImageWorkshopDimension(float64(height)*constraints.MaxAspectRatio, multiple)
		} else if float64(height)/float64(width) > constraints.MaxAspectRatio {
			height = floorImageWorkshopDimension(float64(width)*constraints.MaxAspectRatio, multiple)
		}

		pixels := width * height
		if pixels > constraints.MaxPixels {
			scaleToFit(math.Sqrt(float64(constraints.MaxPixels) / float64(pixels)))
		} else if pixels < constraints.MinPixels {
			scaleToFill(math.Sqrt(float64(constraints.MinPixels) / float64(pixels)))
		}
	}
	return width, height
}

func roundImageWorkshopDimension(value int64, multiple int64) int64 {
	return max(multiple, int64(math.Round(float64(value)/float64(multiple)))*multiple)
}

func floorImageWorkshopDimension(value float64, multiple int64) int64 {
	return max(multiple, int64(math.Floor(value/float64(multiple)))*multiple)
}

func ceilImageWorkshopDimension(value float64, multiple int64) int64 {
	return max(multiple, int64(math.Ceil(value/float64(multiple)))*multiple)
}

func containsImageWorkshopCapabilityOption(options []string, value string) bool {
	for _, option := range options {
		if option == value {
			return true
		}
	}
	return false
}

func imageWorkshopCapabilityForModel(modelName string, fullCapability bool) (ImageWorkshopModelCapability, bool) {
	lowerName := strings.ToLower(strings.TrimSpace(modelName))
	capability := ImageWorkshopModelCapability{
		Model:                         modelName,
		MaxImages:                     1,
		SupportsTransparentBackground: false,
	}

	switch {
	case lowerName == "gpt-image-2":
		return gptImage2WorkshopCapability(capability), true
	case strings.HasPrefix(lowerName, "gpt-image-") || lowerName == "chatgpt-image-latest":
		if !fullCapability {
			return conservativeImageWorkshopCapability(capability), true
		}
		return fullGPTImageWorkshopCapability(capability), true
	case lowerName == "dall-e-3":
		if !fullCapability {
			return conservativeImageWorkshopCapability(capability), true
		}
		capability.Sizes = []string{"1024x1024", "1792x1024", "1024x1792"}
		capability.Qualities = []string{"standard", "hd"}
		capability.DefaultSize = "1024x1024"
		capability.DefaultQuality = "standard"
		return capability, true
	case lowerName == "dall-e-2":
		if !fullCapability {
			return conservativeImageWorkshopCapability(capability), true
		}
		capability.Sizes = []string{"256x256", "512x512", "1024x1024"}
		capability.Qualities = []string{"standard"}
		capability.DefaultSize = "1024x1024"
		capability.DefaultQuality = "standard"
		capability.MaxImages = 4
		return capability, true
	case common.IsImageGenerationModel(lowerName):
		capability.Sizes = []string{"auto"}
		capability.Qualities = []string{"auto"}
		capability.DefaultSize = "auto"
		capability.DefaultQuality = "auto"
		return capability, true
	default:
		return ImageWorkshopModelCapability{}, false
	}
}

func gptImage2WorkshopCapability(capability ImageWorkshopModelCapability) ImageWorkshopModelCapability {
	capability = fullGPTImageWorkshopCapability(capability)
	capability.Sizes = append([]string{"auto"}, gptImage2PresetSizes...)
	capability.SizeTiers = []string{"1K", "2K", "4K"}
	capability.AspectRatios = []string{"1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"}
	capability.SupportsCustomSize = true
	capability.SizeConstraints = &ImageWorkshopSizeConstraints{
		Multiple:       16,
		MaxEdge:        3840,
		MaxAspectRatio: 3,
		MinPixels:      655_360,
		MaxPixels:      8_294_400,
	}
	return capability
}

func fullGPTImageWorkshopCapability(capability ImageWorkshopModelCapability) ImageWorkshopModelCapability {
	capability.Sizes = []string{"auto", "1024x1024", "1536x1024", "1024x1536"}
	capability.Qualities = []string{"auto", "low", "medium", "high"}
	capability.OutputFormats = []string{"png", "jpeg", "webp"}
	capability.DefaultSize = "auto"
	capability.DefaultQuality = "auto"
	capability.DefaultOutputFormat = "png"
	capability.MaxImages = 4
	return capability
}

func conservativeImageWorkshopCapability(capability ImageWorkshopModelCapability) ImageWorkshopModelCapability {
	capability.Sizes = []string{"auto"}
	capability.Qualities = []string{"auto"}
	capability.DefaultSize = "auto"
	capability.DefaultQuality = "auto"
	capability.OutputFormats = []string{}
	capability.DefaultOutputFormat = ""
	capability.MaxImages = 1
	return capability
}

func isCertifiedImageWorkshopChannel(candidate model.ImageWorkshopChannelCandidate) bool {
	if candidate.ChannelType != constant.ChannelTypeOpenAI {
		return false
	}
	if strings.TrimSpace(candidate.ModelMapping) != "" || strings.TrimSpace(candidate.ParamOverride) != "" {
		return false
	}
	baseURL := candidate.BaseURL
	if strings.TrimSpace(baseURL) == "" {
		baseURL = constant.ChannelBaseURLs[candidate.ChannelType]
	}
	parsed, err := url.Parse(baseURL)
	return err == nil && strings.EqualFold(parsed.Hostname(), "api.openai.com")
}
