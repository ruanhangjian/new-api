package operation_setting

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

type AffiliateRebateSetting struct {
	Enabled            bool    `json:"enabled"`
	Rate               float64 `json:"rate"`
	DailyCapQuota      int     `json:"daily_cap_quota"`
	MinSettlementQuota int     `json:"min_settlement_quota"`
	StartTime          int64   `json:"start_time"`
	SettlementHour     int     `json:"settlement_hour"`
	GrayEnabled        bool    `json:"gray_enabled"`
	GrayUserIds        string  `json:"gray_user_ids"`
}

var affiliateRebateSetting = AffiliateRebateSetting{
	Enabled:            false,
	Rate:               0.02,
	DailyCapQuota:      25000000,
	MinSettlementQuota: 5000,
	StartTime:          0,
	SettlementHour:     2,
	GrayEnabled:        false,
	GrayUserIds:        "",
}

func init() {
	config.GlobalConfig.Register("affiliate_rebate_setting", &affiliateRebateSetting)
}

func GetAffiliateRebateSetting() *AffiliateRebateSetting {
	return &affiliateRebateSetting
}

func CanUseAffiliateRebate(userId int) bool {
	cfg := GetAffiliateRebateSetting()
	if !cfg.Enabled {
		return false
	}
	if !cfg.GrayEnabled {
		return true
	}
	for _, part := range strings.FieldsFunc(cfg.GrayUserIds, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\t' || r == ' '
	}) {
		if part == "" {
			continue
		}
		if id, err := strconv.Atoi(part); err == nil && id == userId {
			return true
		}
	}
	return false
}
