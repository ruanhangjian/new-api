package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const (
	ChannelBalanceAccountTypeNewAPI  = "newapi"
	ChannelBalanceAccountTypeSub2API = "sub2api"
)

type ChannelBalanceAccount struct {
	Id                 int     `json:"id"`
	Name               string  `json:"name" gorm:"type:varchar(128);not null"`
	Type               string  `json:"type" gorm:"type:varchar(32);not null;index"`
	BaseURL            string  `json:"base_url" gorm:"type:varchar(512);not null"`
	RechargeURL        string  `json:"recharge_url" gorm:"type:varchar(512)"`
	Key                string  `json:"-" gorm:"type:text;not null"`
	UpstreamUserID     int     `json:"upstream_user_id" gorm:"default:0"`
	Enabled            bool    `json:"enabled" gorm:"default:true"`
	Balance            float64 `json:"balance"`
	Unit               string  `json:"unit" gorm:"type:varchar(16);default:'USD'"`
	BalanceUpdatedTime int64   `json:"balance_updated_time" gorm:"bigint"`
	Threshold          float64 `json:"threshold"`
	AlertEnabled       bool    `json:"alert_enabled" gorm:"default:false"`
	AlertCooldownHours int     `json:"alert_cooldown_hours" gorm:"default:24"`
	LastAlertTime      int64   `json:"last_alert_time" gorm:"bigint"`
	Remark             string  `json:"remark" gorm:"type:varchar(255)"`
	CreatedTime        int64   `json:"created_time" gorm:"bigint"`
	UpdatedTime        int64   `json:"updated_time" gorm:"bigint"`
}

func (ChannelBalanceAccount) TableName() string {
	return "channel_balance_accounts"
}

func NormalizeChannelBalanceAccountType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case ChannelBalanceAccountTypeNewAPI:
		return ChannelBalanceAccountTypeNewAPI
	case ChannelBalanceAccountTypeSub2API:
		return ChannelBalanceAccountTypeSub2API
	default:
		return ""
	}
}

func validateChannelBalanceAccount(account *ChannelBalanceAccount, isCreate bool) error {
	account.Name = strings.TrimSpace(account.Name)
	account.Type = NormalizeChannelBalanceAccountType(account.Type)
	account.BaseURL = strings.TrimRight(strings.TrimSpace(account.BaseURL), "/")
	account.RechargeURL = strings.TrimSpace(account.RechargeURL)
	account.Unit = strings.TrimSpace(account.Unit)
	account.Remark = strings.TrimSpace(account.Remark)

	if account.Name == "" {
		return errors.New("名称不能为空")
	}
	if account.Type == "" {
		return errors.New("上游类型无效")
	}
	if account.BaseURL == "" {
		return errors.New("Base URL 不能为空")
	}
	if isCreate && strings.TrimSpace(account.Key) == "" {
		return errors.New("API Key 不能为空")
	}
	if account.Type == ChannelBalanceAccountTypeNewAPI && account.UpstreamUserID <= 0 {
		return errors.New("NewAPI 用户 ID 不能为空")
	}
	if account.Unit == "" {
		account.Unit = "USD"
	}
	if account.AlertCooldownHours <= 0 {
		account.AlertCooldownHours = 24
	}
	if account.Threshold < 0 {
		return errors.New("告警阈值不能小于 0")
	}
	return nil
}

func InsertChannelBalanceAccount(account *ChannelBalanceAccount) error {
	if err := validateChannelBalanceAccount(account, true); err != nil {
		return err
	}
	now := common.GetTimestamp()
	account.CreatedTime = now
	account.UpdatedTime = now
	return DB.Create(account).Error
}

func UpdateChannelBalanceAccount(account *ChannelBalanceAccount) error {
	if err := validateChannelBalanceAccount(account, false); err != nil {
		return err
	}
	account.UpdatedTime = common.GetTimestamp()
	return DB.Save(account).Error
}

func GetChannelBalanceAccountByID(id int) (*ChannelBalanceAccount, error) {
	var account ChannelBalanceAccount
	if err := DB.First(&account, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &account, nil
}

func GetAllChannelBalanceAccounts() ([]*ChannelBalanceAccount, error) {
	var accounts []*ChannelBalanceAccount
	err := DB.Order("id desc").Find(&accounts).Error
	return accounts, err
}

func DeleteChannelBalanceAccount(id int) error {
	return DB.Delete(&ChannelBalanceAccount{}, id).Error
}

func (account *ChannelBalanceAccount) UpdateBalance(balance float64, unit string) error {
	unit = strings.TrimSpace(unit)
	if unit == "" {
		unit = "USD"
	}
	account.Balance = balance
	account.Unit = unit
	account.BalanceUpdatedTime = common.GetTimestamp()
	account.UpdatedTime = account.BalanceUpdatedTime
	return DB.Model(account).Select("balance", "unit", "balance_updated_time", "updated_time").Updates(account).Error
}
