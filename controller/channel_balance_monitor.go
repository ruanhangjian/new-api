package controller

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const (
	defaultBalanceAlertCooldownHours          = 24
	channelBalanceAutoRefreshMinutesOptionKey = "ChannelBalanceAutoRefreshMinutes"
	maxChannelBalanceAutoRefreshMinutes       = 10080
)

type sub2APIUsageResponse struct {
	Remaining *float64 `json:"remaining"`
	Balance   *float64 `json:"balance"`
	Unit      string   `json:"unit"`
}

type newAPIStatusResponse struct {
	Success bool `json:"success"`
	Data    struct {
		QuotaPerUnit float64 `json:"quota_per_unit"`
	} `json:"data"`
}

type newAPIUserSelfResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Quota int `json:"quota"`
	} `json:"data"`
	Message string `json:"message"`
}

type ChannelBalanceAccountResponse struct {
	ID                 int     `json:"id"`
	Name               string  `json:"name"`
	Type               string  `json:"type"`
	BaseURL            string  `json:"base_url"`
	RechargeURL        string  `json:"recharge_url"`
	UpstreamUserID     int     `json:"upstream_user_id"`
	Enabled            bool    `json:"enabled"`
	Balance            float64 `json:"balance"`
	Unit               string  `json:"unit"`
	BalanceUpdatedTime int64   `json:"balance_updated_time"`
	Threshold          float64 `json:"threshold"`
	AlertEnabled       bool    `json:"alert_enabled"`
	AlertCooldownHours int     `json:"alert_cooldown_hours"`
	LastAlertTime      int64   `json:"last_alert_time"`
	Remark             string  `json:"remark"`
	CreatedTime        int64   `json:"created_time"`
	UpdatedTime        int64   `json:"updated_time"`
	HasKey             bool    `json:"has_key"`
	LowBalance         bool    `json:"low_balance"`
}

type ChannelBalanceOverviewSummary struct {
	Total           int   `json:"total"`
	Monitored       int   `json:"monitored"`
	LowBalance      int   `json:"low_balance"`
	AlertEnabled    int   `json:"alert_enabled"`
	LastRefreshTime int64 `json:"last_refresh_time"`
}

type ChannelBalanceSettingsResponse struct {
	AutoRefreshMinutes int `json:"auto_refresh_minutes"`
}

type ChannelBalanceOverviewResponse struct {
	Summary  ChannelBalanceOverviewSummary   `json:"summary"`
	Settings ChannelBalanceSettingsResponse  `json:"settings"`
	Items    []ChannelBalanceAccountResponse `json:"items"`
}

type ChannelBalanceSettingsRequest struct {
	AutoRefreshMinutes int `json:"auto_refresh_minutes"`
}

type ChannelBalanceAccountRequest struct {
	Name               string   `json:"name"`
	Type               string   `json:"type"`
	BaseURL            string   `json:"base_url"`
	RechargeURL        string   `json:"recharge_url"`
	Key                *string  `json:"key"`
	UpstreamUserID     *int     `json:"upstream_user_id"`
	Enabled            *bool    `json:"enabled"`
	Threshold          *float64 `json:"threshold"`
	AlertEnabled       *bool    `json:"alert_enabled"`
	AlertCooldownHours *int     `json:"alert_cooldown_hours"`
	Remark             string   `json:"remark"`
}

type ChannelBalanceRefreshResult struct {
	ID      int     `json:"id"`
	Success bool    `json:"success"`
	Message string  `json:"message"`
	Balance float64 `json:"balance,omitempty"`
	Unit    string  `json:"unit,omitempty"`
}

func parseBalanceAccountID(c *gin.Context) (int, error) {
	return strconv.Atoi(c.Param("id"))
}

func normalizeBalanceAlertCooldown(hours int) int {
	if hours <= 0 {
		return defaultBalanceAlertCooldownHours
	}
	return hours
}

func getChannelBalanceAutoRefreshMinutes() int {
	common.OptionMapRWMutex.RLock()
	value := strings.TrimSpace(common.OptionMap[channelBalanceAutoRefreshMinutesOptionKey])
	common.OptionMapRWMutex.RUnlock()

	minutes, err := strconv.Atoi(value)
	if err != nil || minutes < 0 {
		return 0
	}
	if minutes > maxChannelBalanceAutoRefreshMinutes {
		return maxChannelBalanceAutoRefreshMinutes
	}
	return minutes
}

func shouldRefreshChannelBalanceAccounts(now, lastRefreshTime time.Time, minutes int) bool {
	if minutes <= 0 {
		return false
	}
	return !now.Before(lastRefreshTime.Add(time.Duration(minutes) * time.Minute))
}

func buildChannelBalanceAccountResponse(account *model.ChannelBalanceAccount) ChannelBalanceAccountResponse {
	cooldownHours := normalizeBalanceAlertCooldown(account.AlertCooldownHours)
	lowBalance := account.Enabled && account.Threshold > 0 && account.Balance < account.Threshold
	return ChannelBalanceAccountResponse{
		ID:                 account.Id,
		Name:               account.Name,
		Type:               account.Type,
		BaseURL:            account.BaseURL,
		RechargeURL:        account.RechargeURL,
		UpstreamUserID:     account.UpstreamUserID,
		Enabled:            account.Enabled,
		Balance:            account.Balance,
		Unit:               account.Unit,
		BalanceUpdatedTime: account.BalanceUpdatedTime,
		Threshold:          account.Threshold,
		AlertEnabled:       account.AlertEnabled,
		AlertCooldownHours: cooldownHours,
		LastAlertTime:      account.LastAlertTime,
		Remark:             account.Remark,
		CreatedTime:        account.CreatedTime,
		UpdatedTime:        account.UpdatedTime,
		HasKey:             strings.TrimSpace(account.Key) != "",
		LowBalance:         lowBalance,
	}
}

func applyChannelBalanceAccountRequest(account *model.ChannelBalanceAccount, req ChannelBalanceAccountRequest, isCreate bool) {
	account.Name = req.Name
	account.Type = model.NormalizeChannelBalanceAccountType(req.Type)
	account.BaseURL = strings.TrimRight(strings.TrimSpace(req.BaseURL), "/")
	account.RechargeURL = strings.TrimSpace(req.RechargeURL)
	account.Remark = req.Remark
	if req.Key != nil {
		account.Key = strings.TrimSpace(*req.Key)
	}
	if req.UpstreamUserID != nil {
		account.UpstreamUserID = *req.UpstreamUserID
	}
	if req.Enabled != nil {
		account.Enabled = *req.Enabled
	} else if isCreate {
		account.Enabled = true
	}
	if req.Threshold != nil {
		account.Threshold = *req.Threshold
	}
	if req.AlertEnabled != nil {
		account.AlertEnabled = *req.AlertEnabled
	}
	if req.AlertCooldownHours != nil {
		account.AlertCooldownHours = normalizeBalanceAlertCooldown(*req.AlertCooldownHours)
	} else if isCreate {
		account.AlertCooldownHours = defaultBalanceAlertCooldownHours
	}
	if account.Unit == "" {
		account.Unit = "USD"
	}
}

func getAccountResponseBodyWithHeaders(method, url string, account *model.ChannelBalanceAccount, headers map[string]string) ([]byte, error) {
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", account.Key))
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	client, err := service.NewProxyHttpClient("")
	if err != nil {
		return nil, err
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status code: %d", res.StatusCode)
	}
	return io.ReadAll(res.Body)
}

func getAccountResponseBody(method, url string, account *model.ChannelBalanceAccount) ([]byte, error) {
	return getAccountResponseBodyWithHeaders(method, url, account, nil)
}

func querySub2APIAccountBalance(account *model.ChannelBalanceAccount) (float64, string, error) {
	baseURL := strings.TrimRight(account.BaseURL, "/")
	if baseURL == "" {
		return 0, "", errors.New("Base URL 为空")
	}

	body, err := getAccountResponseBody(http.MethodGet, baseURL+"/v1/usage", account)
	if err != nil {
		return 0, "", err
	}

	var response sub2APIUsageResponse
	if err = common.Unmarshal(body, &response); err != nil {
		return 0, "", err
	}

	unit := strings.TrimSpace(response.Unit)
	if unit == "" {
		unit = "USD"
	}
	if response.Remaining != nil {
		return *response.Remaining, unit, nil
	}
	if response.Balance != nil {
		return *response.Balance, unit, nil
	}
	return 0, unit, errors.New("Sub2API 用量响应缺少 remaining/balance 字段")
}

func queryNewAPIAccountBalance(account *model.ChannelBalanceAccount) (float64, string, error) {
	baseURL := strings.TrimRight(account.BaseURL, "/")
	if baseURL == "" {
		return 0, "", errors.New("Base URL 为空")
	}
	if account.UpstreamUserID <= 0 {
		return 0, "", errors.New("NewAPI 用户 ID 为空")
	}

	body, err := getAccountResponseBody(http.MethodGet, baseURL+"/api/status", account)
	if err != nil {
		return 0, "", err
	}
	status := newAPIStatusResponse{}
	if err = common.Unmarshal(body, &status); err != nil {
		return 0, "", err
	}
	quotaPerUnit := status.Data.QuotaPerUnit
	if quotaPerUnit <= 0 {
		quotaPerUnit = common.QuotaPerUnit
	}

	headers := map[string]string{"New-Api-User": strconv.Itoa(account.UpstreamUserID)}
	body, err = getAccountResponseBodyWithHeaders(http.MethodGet, baseURL+"/api/user/self", account, headers)
	if err != nil {
		return 0, "", err
	}
	userSelf := newAPIUserSelfResponse{}
	if err = common.Unmarshal(body, &userSelf); err != nil {
		return 0, "", err
	}
	if !userSelf.Success {
		message := strings.TrimSpace(userSelf.Message)
		if message == "" {
			message = "NewAPI 用户余额响应失败"
		}
		return 0, "", errors.New(message)
	}
	return float64(userSelf.Data.Quota) / quotaPerUnit, "USD", nil
}

func queryChannelBalanceAccount(account *model.ChannelBalanceAccount) (float64, string, error) {
	switch model.NormalizeChannelBalanceAccountType(account.Type) {
	case model.ChannelBalanceAccountTypeNewAPI:
		return queryNewAPIAccountBalance(account)
	case model.ChannelBalanceAccountTypeSub2API:
		return querySub2APIAccountBalance(account)
	default:
		return 0, "", errors.New("上游类型无效")
	}
}

func maybeNotifyLowBalanceAccount(account *model.ChannelBalanceAccount, balance float64) {
	if !account.Enabled || !account.AlertEnabled || account.Threshold <= 0 || balance >= account.Threshold {
		return
	}

	now := common.GetTimestamp()
	cooldownSeconds := int64(normalizeBalanceAlertCooldown(account.AlertCooldownHours) * 3600)
	if account.LastAlertTime > 0 && now-account.LastAlertTime < cooldownSeconds {
		return
	}

	subject := fmt.Sprintf("上游余额告警：%s", account.Name)
	content := buildChannelBalanceAlertContent(account, balance)
	service.NotifyRootUser(fmt.Sprintf("%s_%d", dto.NotifyTypeChannelBalance, account.Id), subject, content)

	account.LastAlertTime = now
	account.UpdatedTime = now
	if err := model.DB.Model(account).Select("last_alert_time", "updated_time").Updates(account).Error; err != nil {
		common.SysLog(fmt.Sprintf("failed to update channel balance account alert time: account_id=%d, error=%v", account.Id, err))
	}
}

func buildChannelBalanceAlertContent(account *model.ChannelBalanceAccount, balance float64) string {
	content := fmt.Sprintf(
		"上游余额账户 #%d（%s）当前余额 %.4f %s，已低于告警阈值 %.4f。<br/>Base URL：%s",
		account.Id,
		account.Name,
		balance,
		account.Unit,
		account.Threshold,
		account.BaseURL,
	)

	rechargeURL := strings.TrimSpace(account.RechargeURL)
	if rechargeURL != "" {
		content += fmt.Sprintf("<br/>充值地址：<a href='%s'>%s</a>", rechargeURL, rechargeURL)
	}

	return content + "<br/>请及时检查上游账户余额。"
}

func GetChannelBalanceOverview(c *gin.Context) {
	accounts, err := model.GetAllChannelBalanceAccounts()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]ChannelBalanceAccountResponse, 0, len(accounts))
	summary := ChannelBalanceOverviewSummary{Total: len(accounts)}
	for _, account := range accounts {
		item := buildChannelBalanceAccountResponse(account)
		items = append(items, item)
		if item.Enabled {
			summary.Monitored++
		}
		if item.LowBalance {
			summary.LowBalance++
		}
		if item.AlertEnabled {
			summary.AlertEnabled++
		}
		if item.BalanceUpdatedTime > summary.LastRefreshTime {
			summary.LastRefreshTime = item.BalanceUpdatedTime
		}
	}

	common.ApiSuccess(c, ChannelBalanceOverviewResponse{
		Summary: summary,
		Settings: ChannelBalanceSettingsResponse{
			AutoRefreshMinutes: getChannelBalanceAutoRefreshMinutes(),
		},
		Items: items,
	})
}

func UpdateChannelBalanceSettings(c *gin.Context) {
	var req ChannelBalanceSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.AutoRefreshMinutes < 0 || req.AutoRefreshMinutes > maxChannelBalanceAutoRefreshMinutes {
		common.ApiErrorMsg(c, fmt.Sprintf("自动刷新频率必须在 0 到 %d 分钟之间", maxChannelBalanceAutoRefreshMinutes))
		return
	}
	if err := model.UpdateOption(channelBalanceAutoRefreshMinutesOptionKey, strconv.Itoa(req.AutoRefreshMinutes)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, ChannelBalanceSettingsResponse{
		AutoRefreshMinutes: req.AutoRefreshMinutes,
	})
}

func CreateChannelBalanceAccount(c *gin.Context) {
	var req ChannelBalanceAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	account := &model.ChannelBalanceAccount{}
	applyChannelBalanceAccountRequest(account, req, true)
	if err := model.InsertChannelBalanceAccount(account); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildChannelBalanceAccountResponse(account))
}

func UpdateChannelBalanceAccount(c *gin.Context) {
	id, err := parseBalanceAccountID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req ChannelBalanceAccountRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	account, err := model.GetChannelBalanceAccountByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	applyChannelBalanceAccountRequest(account, req, false)
	if err = model.UpdateChannelBalanceAccount(account); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildChannelBalanceAccountResponse(account))
}

func DeleteChannelBalanceAccount(c *gin.Context) {
	id, err := parseBalanceAccountID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err = model.DeleteChannelBalanceAccount(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func RefreshChannelBalanceAccount(c *gin.Context) {
	id, err := parseBalanceAccountID(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	account, err := model.GetChannelBalanceAccountByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	balance, unit, err := queryChannelBalanceAccount(account)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err = account.UpdateBalance(balance, unit); err != nil {
		common.ApiError(c, err)
		return
	}
	maybeNotifyLowBalanceAccount(account, balance)
	common.ApiSuccess(c, ChannelBalanceRefreshResult{
		ID:      account.Id,
		Success: true,
		Balance: account.Balance,
		Unit:    account.Unit,
	})
}

func RefreshAllChannelBalanceAccounts(c *gin.Context) {
	results, err := refreshEnabledChannelBalanceAccounts()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, results)
}

func refreshEnabledChannelBalanceAccounts() ([]ChannelBalanceRefreshResult, error) {
	accounts, err := model.GetAllChannelBalanceAccounts()
	if err != nil {
		return nil, err
	}

	results := make([]ChannelBalanceRefreshResult, 0, len(accounts))
	for _, account := range accounts {
		if !account.Enabled {
			continue
		}
		balance, unit, err := queryChannelBalanceAccount(account)
		if err != nil {
			results = append(results, ChannelBalanceRefreshResult{
				ID:      account.Id,
				Success: false,
				Message: err.Error(),
			})
			continue
		}
		if err = account.UpdateBalance(balance, unit); err != nil {
			results = append(results, ChannelBalanceRefreshResult{
				ID:      account.Id,
				Success: false,
				Message: err.Error(),
			})
			continue
		}
		maybeNotifyLowBalanceAccount(account, balance)
		results = append(results, ChannelBalanceRefreshResult{
			ID:      account.Id,
			Success: true,
			Balance: account.Balance,
			Unit:    account.Unit,
		})
		time.Sleep(common.RequestInterval)
	}

	return results, nil
}

func StartChannelBalanceAutoRefreshTask() {
	go func() {
		common.SysLog("channel balance auto refresh task started")
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()

		lastRefreshTime := time.Now()
		for range ticker.C {
			minutes := getChannelBalanceAutoRefreshMinutes()
			if minutes <= 0 {
				lastRefreshTime = time.Now()
				continue
			}
			if !shouldRefreshChannelBalanceAccounts(time.Now(), lastRefreshTime, minutes) {
				continue
			}
			lastRefreshTime = time.Now()
			common.SysLog(fmt.Sprintf("auto refreshing channel balance accounts: interval=%d minutes", minutes))
			results, err := refreshEnabledChannelBalanceAccounts()
			if err != nil {
				common.SysLog(fmt.Sprintf("failed to auto refresh channel balance accounts: %v", err))
				continue
			}
			failed := 0
			for _, result := range results {
				if !result.Success {
					failed++
				}
			}
			common.SysLog(fmt.Sprintf("channel balance auto refresh done: total=%d failed=%d", len(results), failed))
		}
	}()
}
