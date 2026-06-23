package controller

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	channelMonitorRetentionDays       = 30
	channelMonitorTimelineLimit       = 60
	channelMonitorSchedulerTickSecond = 15
)

type ChannelMonitorRequest struct {
	Name             string   `json:"name"`
	Provider         string   `json:"provider"`
	APIMode          string   `json:"api_mode"`
	Endpoint         string   `json:"endpoint"`
	APIKey           *string  `json:"api_key"`
	PrimaryModel     string   `json:"primary_model"`
	ExtraModels      []string `json:"extra_models"`
	GroupName        string   `json:"group_name"`
	Enabled          *bool    `json:"enabled"`
	IntervalSeconds  int      `json:"interval_seconds"`
	TemplateID       int      `json:"template_id"`
	ExtraHeaders     string   `json:"extra_headers"`
	BodyOverrideMode string   `json:"body_override_mode"`
	BodyOverride     string   `json:"body_override"`
}

type ChannelMonitorResponse struct {
	ID                   int                              `json:"id"`
	Name                 string                           `json:"name"`
	Provider             string                           `json:"provider"`
	APIMode              string                           `json:"api_mode"`
	Endpoint             string                           `json:"endpoint"`
	APIKeyMasked         string                           `json:"api_key_masked"`
	HasAPIKey            bool                             `json:"has_api_key"`
	PrimaryModel         string                           `json:"primary_model"`
	ExtraModels          []string                         `json:"extra_models"`
	GroupName            string                           `json:"group_name"`
	Enabled              bool                             `json:"enabled"`
	IntervalSeconds      int                              `json:"interval_seconds"`
	LastCheckedAt        int64                            `json:"last_checked_at"`
	CreatedBy            int                              `json:"created_by"`
	TemplateID           int                              `json:"template_id"`
	ExtraHeaders         string                           `json:"extra_headers"`
	BodyOverrideMode     string                           `json:"body_override_mode"`
	BodyOverride         string                           `json:"body_override"`
	CreatedTime          int64                            `json:"created_time"`
	UpdatedTime          int64                            `json:"updated_time"`
	PrimaryStatus        string                           `json:"primary_status"`
	PrimaryLatencyMS     int                              `json:"primary_latency_ms"`
	PrimaryPingLatencyMS int                              `json:"primary_ping_latency_ms"`
	Availability7D       float64                          `json:"availability_7d"`
	ExtraModelsStatus    []ChannelMonitorExtraModelStatus `json:"extra_models_status"`
}

type ChannelMonitorExtraModelStatus struct {
	Model     string `json:"model"`
	Status    string `json:"status"`
	LatencyMS int    `json:"latency_ms"`
}

type ChannelMonitorTimelinePoint struct {
	Status        string `json:"status"`
	LatencyMS     int    `json:"latency_ms"`
	PingLatencyMS int    `json:"ping_latency_ms"`
	CheckedAt     int64  `json:"checked_at"`
}

type UserChannelMonitorView struct {
	ID                   int                           `json:"id"`
	Name                 string                        `json:"name"`
	Provider             string                        `json:"provider"`
	GroupName            string                        `json:"group_name"`
	PrimaryModel         string                        `json:"primary_model"`
	PrimaryStatus        string                        `json:"primary_status"`
	PrimaryLatencyMS     int                           `json:"primary_latency_ms"`
	PrimaryPingLatencyMS int                           `json:"primary_ping_latency_ms"`
	Availability7D       float64                       `json:"availability_7d"`
	Availability15D      float64                       `json:"availability_15d"`
	Availability30D      float64                       `json:"availability_30d"`
	ExtraModels          []string                      `json:"extra_models"`
	Timeline             []ChannelMonitorTimelinePoint `json:"timeline"`
	LastCheckedAt        int64                         `json:"last_checked_at"`
}

type UserChannelMonitorDetail struct {
	ID        int                             `json:"id"`
	Name      string                          `json:"name"`
	Provider  string                          `json:"provider"`
	GroupName string                          `json:"group_name"`
	Models    []UserChannelMonitorModelDetail `json:"models"`
}

type UserChannelMonitorModelDetail struct {
	Model           string  `json:"model"`
	LatestStatus    string  `json:"latest_status"`
	LatestLatencyMS int     `json:"latest_latency_ms"`
	Availability7D  float64 `json:"availability_7d"`
	Availability15D float64 `json:"availability_15d"`
	Availability30D float64 `json:"availability_30d"`
	AvgLatency7DMS  int     `json:"avg_latency_7d_ms"`
	LastCheckedAt   int64   `json:"last_checked_at"`
}

type ChannelMonitorTemplateRequest struct {
	Name             string `json:"name"`
	Provider         string `json:"provider"`
	APIMode          string `json:"api_mode"`
	ExtraHeaders     string `json:"extra_headers"`
	BodyOverrideMode string `json:"body_override_mode"`
	BodyOverride     string `json:"body_override"`
}

var channelMonitorRunning sync.Map

func parseChannelMonitorID(c *gin.Context) (int, error) {
	return strconv.Atoi(c.Param("id"))
}

func parseOptionalEnabled(value string) *bool {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" || value == "all" {
		return nil
	}
	enabled := value == "true" || value == "1" || value == "enabled"
	return &enabled
}

func maskChannelMonitorAPIKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return ""
	}
	if len(key) <= 8 {
		return strings.Repeat("*", len(key))
	}
	return key[:4] + strings.Repeat("*", 6) + key[len(key)-4:]
}

func applyChannelMonitorRequest(monitor *model.ChannelMonitor, req ChannelMonitorRequest, isCreate bool) {
	monitor.Name = req.Name
	monitor.Provider = req.Provider
	monitor.APIMode = req.APIMode
	monitor.Endpoint = req.Endpoint
	if req.APIKey != nil {
		monitor.APIKey = strings.TrimSpace(*req.APIKey)
	}
	monitor.PrimaryModel = req.PrimaryModel
	monitor.ExtraModels = model.EncodeChannelMonitorExtraModels(req.ExtraModels)
	monitor.GroupName = req.GroupName
	if req.Enabled != nil {
		monitor.Enabled = *req.Enabled
	} else if isCreate {
		monitor.Enabled = true
	}
	monitor.IntervalSeconds = req.IntervalSeconds
	monitor.TemplateID = req.TemplateID
	monitor.ExtraHeaders = req.ExtraHeaders
	monitor.BodyOverrideMode = req.BodyOverrideMode
	monitor.BodyOverride = req.BodyOverride
}

func buildChannelMonitorResponse(monitor *model.ChannelMonitor) ChannelMonitorResponse {
	latest, _ := model.GetLatestChannelMonitorHistory(monitor.Id, monitor.PrimaryModel)
	status := model.ChannelMonitorStatusOperational
	latency := 0
	pingLatency := 0
	if latest != nil {
		status = latest.Status
		latency = latest.LatencyMS
		pingLatency = latest.PingLatencyMS
	}
	sevenDaysAgo := common.GetTimestamp() - 7*86400
	histories, _ := model.GetChannelMonitorHistoriesSince(monitor.Id, monitor.PrimaryModel, sevenDaysAgo)
	extraModels := model.ParseChannelMonitorExtraModels(monitor.ExtraModels)
	extraStatuses := make([]ChannelMonitorExtraModelStatus, 0, len(extraModels))
	for _, extraModel := range extraModels {
		extraLatest, _ := model.GetLatestChannelMonitorHistory(monitor.Id, extraModel)
		extraStatus := ""
		extraLatency := 0
		if extraLatest != nil {
			extraStatus = extraLatest.Status
			extraLatency = extraLatest.LatencyMS
		}
		extraStatuses = append(extraStatuses, ChannelMonitorExtraModelStatus{
			Model:     extraModel,
			Status:    extraStatus,
			LatencyMS: extraLatency,
		})
	}
	return ChannelMonitorResponse{
		ID:                   monitor.Id,
		Name:                 monitor.Name,
		Provider:             monitor.Provider,
		APIMode:              monitor.APIMode,
		Endpoint:             monitor.Endpoint,
		APIKeyMasked:         maskChannelMonitorAPIKey(monitor.APIKey),
		HasAPIKey:            strings.TrimSpace(monitor.APIKey) != "",
		PrimaryModel:         monitor.PrimaryModel,
		ExtraModels:          extraModels,
		GroupName:            monitor.GroupName,
		Enabled:              monitor.Enabled,
		IntervalSeconds:      monitor.IntervalSeconds,
		LastCheckedAt:        monitor.LastCheckedAt,
		CreatedBy:            monitor.CreatedBy,
		TemplateID:           monitor.TemplateID,
		ExtraHeaders:         monitor.ExtraHeaders,
		BodyOverrideMode:     monitor.BodyOverrideMode,
		BodyOverride:         monitor.BodyOverride,
		CreatedTime:          monitor.CreatedTime,
		UpdatedTime:          monitor.UpdatedTime,
		PrimaryStatus:        status,
		PrimaryLatencyMS:     latency,
		PrimaryPingLatencyMS: pingLatency,
		Availability7D:       service.CalculateChannelMonitorAvailability(histories),
		ExtraModelsStatus:    extraStatuses,
	}
}

func buildUserChannelMonitorView(monitor *model.ChannelMonitor) UserChannelMonitorView {
	response := buildChannelMonitorResponse(monitor)
	histories, _ := model.GetChannelMonitorHistories(monitor.Id, monitor.PrimaryModel, channelMonitorTimelineLimit)
	now := common.GetTimestamp()
	histories15D, _ := model.GetChannelMonitorHistoriesSince(monitor.Id, monitor.PrimaryModel, now-15*86400)
	histories30D, _ := model.GetChannelMonitorHistoriesSince(monitor.Id, monitor.PrimaryModel, now-30*86400)
	timeline := make([]ChannelMonitorTimelinePoint, 0, len(histories))
	for i := len(histories) - 1; i >= 0; i-- {
		history := histories[i]
		timeline = append(timeline, ChannelMonitorTimelinePoint{
			Status:        history.Status,
			LatencyMS:     history.LatencyMS,
			PingLatencyMS: history.PingLatencyMS,
			CheckedAt:     history.CheckedAt,
		})
	}
	return UserChannelMonitorView{
		ID:                   response.ID,
		Name:                 response.Name,
		Provider:             response.Provider,
		GroupName:            response.GroupName,
		PrimaryModel:         response.PrimaryModel,
		PrimaryStatus:        response.PrimaryStatus,
		PrimaryLatencyMS:     response.PrimaryLatencyMS,
		PrimaryPingLatencyMS: response.PrimaryPingLatencyMS,
		Availability7D:       response.Availability7D,
		Availability15D:      service.CalculateChannelMonitorAvailability(histories15D),
		Availability30D:      service.CalculateChannelMonitorAvailability(histories30D),
		ExtraModels:          response.ExtraModels,
		Timeline:             timeline,
		LastCheckedAt:        response.LastCheckedAt,
	}
}

func ListChannelMonitors(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	monitors, total, err := model.SearchChannelMonitors(
		c.Query("provider"),
		parseOptionalEnabled(c.Query("enabled")),
		c.Query("search"),
		pageInfo.GetStartIdx(),
		pageInfo.GetPageSize(),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]ChannelMonitorResponse, 0, len(monitors))
	for _, monitor := range monitors {
		items = append(items, buildChannelMonitorResponse(monitor))
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func GetChannelMonitor(c *gin.Context) {
	id, err := parseChannelMonitorID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	monitor, err := model.GetChannelMonitorByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildChannelMonitorResponse(monitor))
}

func CreateChannelMonitor(c *gin.Context) {
	var req ChannelMonitorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	monitor := &model.ChannelMonitor{CreatedBy: c.GetInt("id")}
	applyChannelMonitorRequest(monitor, req, true)
	if err := monitor.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	go runChannelMonitorByID(monitor.Id)
	common.ApiSuccess(c, buildChannelMonitorResponse(monitor))
}

func UpdateChannelMonitor(c *gin.Context) {
	id, err := parseChannelMonitorID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	monitor, err := model.GetChannelMonitorByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req ChannelMonitorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	applyChannelMonitorRequest(monitor, req, false)
	if err := monitor.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildChannelMonitorResponse(monitor))
}

func DeleteChannelMonitor(c *gin.Context) {
	id, err := parseChannelMonitorID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteChannelMonitor(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func RunChannelMonitor(c *gin.Context) {
	id, err := parseChannelMonitorID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	results, err := runChannelMonitorByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, results)
}

func GetChannelMonitorHistory(c *gin.Context) {
	id, err := parseChannelMonitorID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	histories, err := model.GetChannelMonitorHistories(id, c.Query("model"), limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, histories)
}

func ListChannelMonitorTemplates(c *gin.Context) {
	templates, err := model.ListChannelMonitorTemplates(c.Query("provider"), c.Query("api_mode"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, templates)
}

func CreateChannelMonitorTemplate(c *gin.Context) {
	var req ChannelMonitorTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	template := &model.ChannelMonitorTemplate{}
	applyChannelMonitorTemplateRequest(template, req)
	if err := template.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, template)
}

func UpdateChannelMonitorTemplate(c *gin.Context) {
	id, err := parseChannelMonitorID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	template, err := model.GetChannelMonitorTemplateByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req ChannelMonitorTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	applyChannelMonitorTemplateRequest(template, req)
	if err := template.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, template)
}

func DeleteChannelMonitorTemplate(c *gin.Context) {
	id, err := parseChannelMonitorID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteChannelMonitorTemplate(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func applyChannelMonitorTemplateRequest(template *model.ChannelMonitorTemplate, req ChannelMonitorTemplateRequest) {
	template.Name = req.Name
	template.Provider = req.Provider
	template.APIMode = req.APIMode
	template.ExtraHeaders = req.ExtraHeaders
	template.BodyOverrideMode = req.BodyOverrideMode
	template.BodyOverride = req.BodyOverride
}

func ListUserChannelStatus(c *gin.Context) {
	if !model.IsChannelMonitorEnabled() {
		common.ApiSuccess(c, []UserChannelMonitorView{})
		return
	}
	monitors, err := model.GetEnabledChannelMonitors()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]UserChannelMonitorView, 0, len(monitors))
	for _, monitor := range monitors {
		items = append(items, buildUserChannelMonitorView(monitor))
	}
	common.ApiSuccess(c, items)
}

func GetUserChannelStatusDetail(c *gin.Context) {
	if !model.IsChannelMonitorEnabled() {
		common.ApiError(c, gorm.ErrRecordNotFound)
		return
	}
	id, err := parseChannelMonitorID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	monitor, err := model.GetChannelMonitorByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !monitor.Enabled {
		common.ApiError(c, gorm.ErrRecordNotFound)
		return
	}
	models := append([]string{monitor.PrimaryModel}, model.ParseChannelMonitorExtraModels(monitor.ExtraModels)...)
	now := common.GetTimestamp()
	details := make([]UserChannelMonitorModelDetail, 0, len(models))
	for _, modelName := range models {
		latest, _ := model.GetLatestChannelMonitorHistory(monitor.Id, modelName)
		histories7D, _ := model.GetChannelMonitorHistoriesSince(monitor.Id, modelName, now-7*86400)
		histories15D, _ := model.GetChannelMonitorHistoriesSince(monitor.Id, modelName, now-15*86400)
		histories30D, _ := model.GetChannelMonitorHistoriesSince(monitor.Id, modelName, now-30*86400)
		latestStatus := ""
		latestLatency := 0
		lastCheckedAt := int64(0)
		if latest != nil {
			latestStatus = latest.Status
			latestLatency = latest.LatencyMS
			lastCheckedAt = latest.CheckedAt
		}
		details = append(details, UserChannelMonitorModelDetail{
			Model:           modelName,
			LatestStatus:    latestStatus,
			LatestLatencyMS: latestLatency,
			Availability7D:  service.CalculateChannelMonitorAvailability(histories7D),
			Availability15D: service.CalculateChannelMonitorAvailability(histories15D),
			Availability30D: service.CalculateChannelMonitorAvailability(histories30D),
			AvgLatency7DMS:  service.AverageChannelMonitorLatency(histories7D),
			LastCheckedAt:   lastCheckedAt,
		})
	}
	common.ApiSuccess(c, UserChannelMonitorDetail{
		ID:        monitor.Id,
		Name:      monitor.Name,
		Provider:  monitor.Provider,
		GroupName: monitor.GroupName,
		Models:    details,
	})
}

func runChannelMonitorByID(id int) ([]service.ChannelMonitorCheckResult, error) {
	if _, loaded := channelMonitorRunning.LoadOrStore(id, true); loaded {
		return nil, errors.New("该监控正在检测中")
	}
	defer channelMonitorRunning.Delete(id)
	monitor, err := model.GetChannelMonitorByID(id)
	if err != nil {
		return nil, err
	}
	return service.CheckAndRecordChannelMonitor(context.Background(), monitor)
}

func StartChannelMonitorTask() {
	go func() {
		ticker := time.NewTicker(channelMonitorSchedulerTickSecond * time.Second)
		defer ticker.Stop()
		cleanupTicker := time.NewTicker(24 * time.Hour)
		defer cleanupTicker.Stop()
		for {
			select {
			case <-ticker.C:
				runDueChannelMonitors()
			case <-cleanupTicker.C:
				_ = model.CleanupChannelMonitorHistories(common.GetTimestamp() - channelMonitorRetentionDays*86400)
			}
		}
	}()
}

func runDueChannelMonitors() {
	if !model.IsChannelMonitorEnabled() {
		return
	}
	monitors, err := model.GetDueChannelMonitors(common.GetTimestamp())
	if err != nil {
		common.SysError("failed to query due channel monitors: " + err.Error())
		return
	}
	for _, monitor := range monitors {
		id := monitor.Id
		go func() {
			if _, err := runChannelMonitorByID(id); err != nil && common.DebugEnabled {
				common.SysError("failed to run channel monitor: " + err.Error())
			}
		}()
	}
}
