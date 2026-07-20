package service

import (
	"errors"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

type ImageWorkshopModelCapability struct {
	Model                         string   `json:"model"`
	Sizes                         []string `json:"sizes"`
	Qualities                     []string `json:"qualities"`
	OutputFormats                 []string `json:"output_formats"`
	DefaultSize                   string   `json:"default_size"`
	DefaultQuality                string   `json:"default_quality"`
	DefaultOutputFormat           string   `json:"default_output_format,omitempty"`
	MaxImages                     int      `json:"max_images"`
	SupportsTransparentBackground bool     `json:"supports_transparent_background"`
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

func imageWorkshopCapabilityForModel(modelName string, fullCapability bool) (ImageWorkshopModelCapability, bool) {
	lowerName := strings.ToLower(strings.TrimSpace(modelName))
	capability := ImageWorkshopModelCapability{
		Model:                         modelName,
		MaxImages:                     1,
		SupportsTransparentBackground: false,
	}

	switch {
	case strings.HasPrefix(lowerName, "gpt-image-") || lowerName == "chatgpt-image-latest":
		if !fullCapability {
			return conservativeImageWorkshopCapability(capability), true
		}
		capability.Sizes = []string{"auto", "1024x1024", "1536x1024", "1024x1536"}
		capability.Qualities = []string{"auto", "low", "medium", "high"}
		capability.OutputFormats = []string{"png", "jpeg", "webp"}
		capability.DefaultSize = "auto"
		capability.DefaultQuality = "auto"
		capability.DefaultOutputFormat = "png"
		capability.MaxImages = 4
		return capability, true
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
