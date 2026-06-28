package model

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	ChannelMonitorEnabledOptionKey = "ChannelMonitorEnabled"

	ChannelMonitorProviderOpenAI    = "openai"
	ChannelMonitorProviderAnthropic = "anthropic"
	ChannelMonitorProviderGemini    = "gemini"

	ChannelMonitorAPIModeChatCompletions = "chat_completions"
	ChannelMonitorAPIModeResponses       = "responses"

	ChannelMonitorBodyOverrideOff     = "off"
	ChannelMonitorBodyOverrideMerge   = "merge"
	ChannelMonitorBodyOverrideReplace = "replace"

	ChannelMonitorStatusOperational = "operational"
	ChannelMonitorStatusDegraded    = "degraded"
	ChannelMonitorStatusFailed      = "failed"
	ChannelMonitorStatusError       = "error"

	ChannelMonitorMinIntervalSeconds     = 15
	ChannelMonitorMaxIntervalSeconds     = 3600
	ChannelMonitorDefaultIntervalSeconds = 60
)

type ChannelMonitor struct {
	Id               int    `json:"id"`
	Name             string `json:"name" gorm:"type:varchar(128);not null;index"`
	Provider         string `json:"provider" gorm:"type:varchar(32);not null;index"`
	APIMode          string `json:"api_mode" gorm:"type:varchar(32);default:'chat_completions'"`
	Endpoint         string `json:"endpoint" gorm:"type:varchar(512);not null"`
	APIKey           string `json:"-" gorm:"column:api_key;type:text;not null"`
	PrimaryModel     string `json:"primary_model" gorm:"type:varchar(191);not null;index"`
	ExtraModels      string `json:"extra_models" gorm:"type:text"`
	GroupName        string `json:"group_name" gorm:"type:varchar(128);index"`
	Enabled          bool   `json:"enabled" gorm:"default:true;index"`
	IntervalSeconds  int    `json:"interval_seconds" gorm:"default:60"`
	LastCheckedAt    int64  `json:"last_checked_at" gorm:"bigint;index"`
	CreatedBy        int    `json:"created_by" gorm:"index"`
	TemplateID       int    `json:"template_id" gorm:"index"`
	ExtraHeaders     string `json:"extra_headers" gorm:"type:text"`
	BodyOverrideMode string `json:"body_override_mode" gorm:"type:varchar(16);default:'off'"`
	BodyOverride     string `json:"body_override" gorm:"type:text"`
	CreatedTime      int64  `json:"created_time" gorm:"bigint"`
	UpdatedTime      int64  `json:"updated_time" gorm:"bigint"`
}

func (ChannelMonitor) TableName() string {
	return "channel_monitors"
}

type ChannelMonitorHistory struct {
	Id            int    `json:"id"`
	MonitorID     int    `json:"monitor_id" gorm:"index:idx_monitor_model_checked,priority:1"`
	Model         string `json:"model" gorm:"type:varchar(191);index:idx_monitor_model_checked,priority:2"`
	Status        string `json:"status" gorm:"type:varchar(32);not null;index"`
	LatencyMS     int    `json:"latency_ms"`
	PingLatencyMS int    `json:"ping_latency_ms"`
	Message       string `json:"message" gorm:"type:varchar(512)"`
	CheckedAt     int64  `json:"checked_at" gorm:"bigint;index:idx_monitor_model_checked,priority:3"`
}

func (ChannelMonitorHistory) TableName() string {
	return "channel_monitor_histories"
}

type ChannelMonitorDailyRollup struct {
	Id               int     `json:"id"`
	MonitorID        int     `json:"monitor_id" gorm:"index:idx_monitor_model_date,priority:1"`
	Model            string  `json:"model" gorm:"type:varchar(191);index:idx_monitor_model_date,priority:2"`
	Date             string  `json:"date" gorm:"type:varchar(10);index:idx_monitor_model_date,priority:3"`
	Availability     float64 `json:"availability"`
	AvgLatencyMS     int     `json:"avg_latency_ms"`
	AvgPingLatencyMS int     `json:"avg_ping_latency_ms"`
	TotalCount       int     `json:"total_count"`
	AvailableCount   int     `json:"available_count"`
	CreatedTime      int64   `json:"created_time" gorm:"bigint"`
	UpdatedTime      int64   `json:"updated_time" gorm:"bigint"`
}

func (ChannelMonitorDailyRollup) TableName() string {
	return "channel_monitor_daily_rollups"
}

type ChannelMonitorTemplate struct {
	Id               int    `json:"id"`
	Name             string `json:"name" gorm:"type:varchar(128);not null;index"`
	Provider         string `json:"provider" gorm:"type:varchar(32);not null;index"`
	APIMode          string `json:"api_mode" gorm:"type:varchar(32);default:'chat_completions'"`
	ExtraHeaders     string `json:"extra_headers" gorm:"type:text"`
	BodyOverrideMode string `json:"body_override_mode" gorm:"type:varchar(16);default:'off'"`
	BodyOverride     string `json:"body_override" gorm:"type:text"`
	CreatedTime      int64  `json:"created_time" gorm:"bigint"`
	UpdatedTime      int64  `json:"updated_time" gorm:"bigint"`
}

func (ChannelMonitorTemplate) TableName() string {
	return "channel_monitor_request_templates"
}

func NormalizeChannelMonitorProvider(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case ChannelMonitorProviderOpenAI:
		return ChannelMonitorProviderOpenAI
	case ChannelMonitorProviderAnthropic:
		return ChannelMonitorProviderAnthropic
	case ChannelMonitorProviderGemini:
		return ChannelMonitorProviderGemini
	default:
		return ""
	}
}

func NormalizeChannelMonitorAPIMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case ChannelMonitorAPIModeResponses:
		return ChannelMonitorAPIModeResponses
	case ChannelMonitorAPIModeChatCompletions, "":
		return ChannelMonitorAPIModeChatCompletions
	default:
		return ""
	}
}

func NormalizeChannelMonitorBodyOverrideMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case ChannelMonitorBodyOverrideMerge:
		return ChannelMonitorBodyOverrideMerge
	case ChannelMonitorBodyOverrideReplace:
		return ChannelMonitorBodyOverrideReplace
	case ChannelMonitorBodyOverrideOff, "":
		return ChannelMonitorBodyOverrideOff
	default:
		return ""
	}
}

func NormalizeChannelMonitorInterval(seconds int) int {
	if seconds <= 0 {
		return ChannelMonitorDefaultIntervalSeconds
	}
	if seconds < ChannelMonitorMinIntervalSeconds {
		return ChannelMonitorMinIntervalSeconds
	}
	if seconds > ChannelMonitorMaxIntervalSeconds {
		return ChannelMonitorMaxIntervalSeconds
	}
	return seconds
}

func ValidateChannelMonitorStatus(status string) bool {
	switch status {
	case ChannelMonitorStatusOperational,
		ChannelMonitorStatusDegraded,
		ChannelMonitorStatusFailed,
		ChannelMonitorStatusError:
		return true
	default:
		return false
	}
}

func ChannelMonitorStatusIsAvailable(status string) bool {
	return status == ChannelMonitorStatusOperational || status == ChannelMonitorStatusDegraded
}

func IsChannelMonitorEnabled() bool {
	common.OptionMapRWMutex.RLock()
	value, ok := common.OptionMap[ChannelMonitorEnabledOptionKey]
	common.OptionMapRWMutex.RUnlock()
	if !ok || strings.TrimSpace(value) == "" {
		return true
	}
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "false", "0", "disabled", "off":
		return false
	default:
		return true
	}
}

func ParseChannelMonitorExtraModels(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return []string{}
	}
	var models []string
	if err := common.UnmarshalJsonStr(value, &models); err != nil {
		return []string{}
	}
	result := make([]string, 0, len(models))
	seen := map[string]bool{}
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model == "" || seen[model] {
			continue
		}
		seen[model] = true
		result = append(result, model)
	}
	return result
}

func EncodeChannelMonitorExtraModels(models []string) string {
	clean := make([]string, 0, len(models))
	seen := map[string]bool{}
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model == "" || seen[model] {
			continue
		}
		seen[model] = true
		clean = append(clean, model)
	}
	if len(clean) == 0 {
		return ""
	}
	data, err := common.Marshal(clean)
	if err != nil {
		return ""
	}
	return string(data)
}

func normalizeChannelMonitorEndpoint(endpoint string) (string, error) {
	endpoint = strings.TrimRight(strings.TrimSpace(endpoint), "/")
	if endpoint == "" {
		return "", errors.New("Endpoint 不能为空")
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("Endpoint 格式无效")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("Endpoint 仅支持 http 或 https")
	}
	return endpoint, nil
}

func validateChannelMonitor(monitor *ChannelMonitor, isCreate bool) error {
	monitor.Name = strings.TrimSpace(monitor.Name)
	monitor.Provider = NormalizeChannelMonitorProvider(monitor.Provider)
	monitor.APIMode = NormalizeChannelMonitorAPIMode(monitor.APIMode)
	monitor.PrimaryModel = strings.TrimSpace(monitor.PrimaryModel)
	monitor.GroupName = strings.TrimSpace(monitor.GroupName)
	monitor.ExtraHeaders = strings.TrimSpace(monitor.ExtraHeaders)
	monitor.BodyOverrideMode = NormalizeChannelMonitorBodyOverrideMode(monitor.BodyOverrideMode)
	monitor.BodyOverride = strings.TrimSpace(monitor.BodyOverride)
	monitor.IntervalSeconds = NormalizeChannelMonitorInterval(monitor.IntervalSeconds)

	if monitor.Name == "" {
		return errors.New("名称不能为空")
	}
	if monitor.Provider == "" {
		return errors.New("供应商无效")
	}
	if monitor.APIMode == "" {
		return errors.New("API 模式无效")
	}
	if monitor.Provider != ChannelMonitorProviderOpenAI {
		monitor.APIMode = ChannelMonitorAPIModeChatCompletions
	}
	endpoint, err := normalizeChannelMonitorEndpoint(monitor.Endpoint)
	if err != nil {
		return err
	}
	monitor.Endpoint = endpoint
	if isCreate && strings.TrimSpace(monitor.APIKey) == "" {
		return errors.New("API Key 不能为空")
	}
	if monitor.PrimaryModel == "" {
		return errors.New("主模型不能为空")
	}
	if monitor.BodyOverrideMode == "" {
		return errors.New("请求体覆盖模式无效")
	}
	if monitor.ExtraHeaders != "" {
		var headers map[string]any
		if err := common.UnmarshalJsonStr(monitor.ExtraHeaders, &headers); err != nil {
			return fmt.Errorf("额外请求头 JSON 无效: %w", err)
		}
	}
	if monitor.BodyOverride != "" {
		var body any
		if err := common.UnmarshalJsonStr(monitor.BodyOverride, &body); err != nil {
			return fmt.Errorf("请求体覆盖 JSON 无效: %w", err)
		}
	}
	return nil
}

func (monitor *ChannelMonitor) Insert() error {
	if err := validateChannelMonitor(monitor, true); err != nil {
		return err
	}
	now := common.GetTimestamp()
	monitor.CreatedTime = now
	monitor.UpdatedTime = now
	return DB.Create(monitor).Error
}

func (monitor *ChannelMonitor) Update() error {
	if err := validateChannelMonitor(monitor, false); err != nil {
		return err
	}
	monitor.UpdatedTime = common.GetTimestamp()
	return DB.Save(monitor).Error
}

func GetChannelMonitorByID(id int) (*ChannelMonitor, error) {
	var monitor ChannelMonitor
	if err := DB.First(&monitor, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &monitor, nil
}

func DeleteChannelMonitor(id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&ChannelMonitor{}, id).Error; err != nil {
			return err
		}
		if err := tx.Where("monitor_id = ?", id).Delete(&ChannelMonitorHistory{}).Error; err != nil {
			return err
		}
		return tx.Where("monitor_id = ?", id).Delete(&ChannelMonitorDailyRollup{}).Error
	})
}

func SearchChannelMonitors(provider string, enabled *bool, keyword string, offset int, limit int) ([]*ChannelMonitor, int64, error) {
	query := DB.Model(&ChannelMonitor{})
	if provider = NormalizeChannelMonitorProvider(provider); provider != "" {
		query = query.Where("provider = ?", provider)
	}
	if enabled != nil {
		query = query.Where("enabled = ?", *enabled)
	}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("name LIKE ? OR primary_model LIKE ? OR group_name LIKE ?", like, like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var monitors []*ChannelMonitor
	if err := query.Order("id DESC").Offset(offset).Limit(limit).Find(&monitors).Error; err != nil {
		return nil, 0, err
	}
	return monitors, total, nil
}

func GetEnabledChannelMonitors() ([]*ChannelMonitor, error) {
	var monitors []*ChannelMonitor
	err := DB.Where("enabled = ?", true).Order("id DESC").Find(&monitors).Error
	return monitors, err
}

func GetDueChannelMonitors(now int64) ([]*ChannelMonitor, error) {
	var monitors []*ChannelMonitor
	err := DB.Where(
		"enabled = ? AND (last_checked_at = 0 OR last_checked_at + interval_seconds <= ?)",
		true,
		now,
	).Find(&monitors).Error
	return monitors, err
}

func UpdateChannelMonitorLastCheckedAt(id int, checkedAt int64) error {
	return DB.Model(&ChannelMonitor{}).Where("id = ?", id).Updates(map[string]any{
		"last_checked_at": checkedAt,
		"updated_time":    checkedAt,
	}).Error
}

func InsertChannelMonitorHistories(histories []ChannelMonitorHistory) error {
	if len(histories) == 0 {
		return nil
	}
	return DB.Create(&histories).Error
}

func GetChannelMonitorHistories(monitorID int, modelName string, limit int) ([]ChannelMonitorHistory, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	query := DB.Where("monitor_id = ?", monitorID)
	if strings.TrimSpace(modelName) != "" {
		query = query.Where("model = ?", strings.TrimSpace(modelName))
	}
	var histories []ChannelMonitorHistory
	err := query.Order("checked_at DESC").Limit(limit).Find(&histories).Error
	return histories, err
}

func GetChannelMonitorHistoriesSince(monitorID int, modelName string, since int64) ([]ChannelMonitorHistory, error) {
	query := DB.Where("monitor_id = ? AND checked_at >= ?", monitorID, since)
	if strings.TrimSpace(modelName) != "" {
		query = query.Where("model = ?", strings.TrimSpace(modelName))
	}
	var histories []ChannelMonitorHistory
	err := query.Order("checked_at ASC").Find(&histories).Error
	return histories, err
}

func GetLatestChannelMonitorHistory(monitorID int, modelName string) (*ChannelMonitorHistory, error) {
	var history ChannelMonitorHistory
	err := DB.Where("monitor_id = ? AND model = ?", monitorID, modelName).
		Order("checked_at DESC").
		First(&history).Error
	if err != nil {
		return nil, err
	}
	return &history, nil
}

func CleanupChannelMonitorHistories(before int64) error {
	return DB.Where("checked_at < ?", before).Delete(&ChannelMonitorHistory{}).Error
}

func validateChannelMonitorTemplate(template *ChannelMonitorTemplate) error {
	template.Name = strings.TrimSpace(template.Name)
	template.Provider = NormalizeChannelMonitorProvider(template.Provider)
	template.APIMode = NormalizeChannelMonitorAPIMode(template.APIMode)
	template.ExtraHeaders = strings.TrimSpace(template.ExtraHeaders)
	template.BodyOverrideMode = NormalizeChannelMonitorBodyOverrideMode(template.BodyOverrideMode)
	template.BodyOverride = strings.TrimSpace(template.BodyOverride)
	if template.Name == "" {
		return errors.New("模板名称不能为空")
	}
	if template.Provider == "" {
		return errors.New("供应商无效")
	}
	if template.APIMode == "" {
		return errors.New("API 模式无效")
	}
	if template.Provider != ChannelMonitorProviderOpenAI {
		template.APIMode = ChannelMonitorAPIModeChatCompletions
	}
	if template.BodyOverrideMode == "" {
		return errors.New("请求体覆盖模式无效")
	}
	if template.ExtraHeaders != "" {
		var headers map[string]any
		if err := common.UnmarshalJsonStr(template.ExtraHeaders, &headers); err != nil {
			return fmt.Errorf("额外请求头 JSON 无效: %w", err)
		}
	}
	if template.BodyOverride != "" {
		var body any
		if err := common.UnmarshalJsonStr(template.BodyOverride, &body); err != nil {
			return fmt.Errorf("请求体覆盖 JSON 无效: %w", err)
		}
	}
	return nil
}

func (template *ChannelMonitorTemplate) Insert() error {
	if err := validateChannelMonitorTemplate(template); err != nil {
		return err
	}
	now := common.GetTimestamp()
	template.CreatedTime = now
	template.UpdatedTime = now
	return DB.Create(template).Error
}

func (template *ChannelMonitorTemplate) Update() error {
	if err := validateChannelMonitorTemplate(template); err != nil {
		return err
	}
	template.UpdatedTime = common.GetTimestamp()
	return DB.Save(template).Error
}

func GetChannelMonitorTemplateByID(id int) (*ChannelMonitorTemplate, error) {
	var template ChannelMonitorTemplate
	if err := DB.First(&template, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &template, nil
}

func ListChannelMonitorTemplates(provider string, apiMode string) ([]ChannelMonitorTemplate, error) {
	query := DB.Model(&ChannelMonitorTemplate{})
	if provider = NormalizeChannelMonitorProvider(provider); provider != "" {
		query = query.Where("provider = ?", provider)
	}
	if apiMode = NormalizeChannelMonitorAPIMode(apiMode); apiMode != "" {
		query = query.Where("api_mode = ?", apiMode)
	}
	var templates []ChannelMonitorTemplate
	err := query.Order("id DESC").Find(&templates).Error
	return templates, err
}

func DeleteChannelMonitorTemplate(id int) error {
	return DB.Delete(&ChannelMonitorTemplate{}, id).Error
}
