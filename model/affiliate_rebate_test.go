package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func resetAffiliateRebateTables(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		DB.Exec("DELETE FROM users")
		DB.Exec("DELETE FROM logs")
		DB.Exec("DELETE FROM affiliate_rebate_settlements")
	})
}

func seedAffiliateUser(t *testing.T, id int, username string, inviterId int) {
	t.Helper()
	user := &User{
		Id:        id,
		Username:  username,
		Status:    common.UserStatusEnabled,
		InviterId: inviterId,
		AffCode:   username + "_aff",
		CreatedAt: int64(1000 - id),
	}
	require.NoError(t, DB.Create(user).Error)
}

func seedAffiliateConsumeLog(t *testing.T, userId int, username string, createdAt int64, quota int) {
	t.Helper()
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: createdAt,
		Type:      LogTypeConsume,
		Quota:     quota,
		Content:   "consume",
	}
	require.NoError(t, LOG_DB.Create(log).Error)
}

func mustUnixInLocation(t *testing.T, loc *time.Location, value string) int64 {
	t.Helper()
	parsed, err := time.ParseInLocation("2006-01-02 15:04:05", value, loc)
	require.NoError(t, err)
	return parsed.Unix()
}

func TestSettleAffiliateRebatesForDateAppliesRatioCapAndMinimum(t *testing.T) {
	resetAffiliateRebateTables(t)
	loc := time.FixedZone("CST", 8*60*60)
	common.QuotaPerUnit = 500000
	operation_setting.GetAffiliateRebateSetting().Enabled = true
	operation_setting.GetAffiliateRebateSetting().Rate = 0.02
	operation_setting.GetAffiliateRebateSetting().DailyCapQuota = 50 * int(common.QuotaPerUnit)
	operation_setting.GetAffiliateRebateSetting().MinSettlementQuota = int(0.01 * common.QuotaPerUnit)
	operation_setting.GetAffiliateRebateSetting().StartTime = mustUnixInLocation(t, loc, "2026-06-01 00:00:00")

	seedAffiliateUser(t, 1, "inviter", 0)
	seedAffiliateUser(t, 2, "normal_invitee", 1)
	seedAffiliateUser(t, 3, "huge_invitee", 1)
	seedAffiliateUser(t, 4, "tiny_invitee", 1)
	seedAffiliateUser(t, 5, "old_invitee", 1)

	day := "2026-06-23"
	seedAffiliateConsumeLog(t, 2, "normal_invitee", mustUnixInLocation(t, loc, "2026-06-23 10:00:00"), 100*int(common.QuotaPerUnit))
	seedAffiliateConsumeLog(t, 3, "huge_invitee", mustUnixInLocation(t, loc, "2026-06-23 11:00:00"), 10000*int(common.QuotaPerUnit))
	seedAffiliateConsumeLog(t, 4, "tiny_invitee", mustUnixInLocation(t, loc, "2026-06-23 12:00:00"), int(0.2*common.QuotaPerUnit))
	seedAffiliateConsumeLog(t, 5, "old_invitee", mustUnixInLocation(t, loc, "2026-05-31 12:00:00"), 100*int(common.QuotaPerUnit))

	result, err := SettleAffiliateRebatesForDate(day, loc)
	require.NoError(t, err)
	require.Equal(t, 2, result.SettledCount)
	require.Equal(t, 50*int(common.QuotaPerUnit), result.TotalRewardQuota)

	var inviter User
	require.NoError(t, DB.First(&inviter, 1).Error)
	require.Equal(t, 50*int(common.QuotaPerUnit), inviter.AffQuota)
	require.Equal(t, 50*int(common.QuotaPerUnit), inviter.AffHistoryQuota)

	var settlements []AffiliateRebateSettlement
	require.NoError(t, DB.Order("invitee_id asc").Find(&settlements).Error)
	require.Len(t, settlements, 2)
	require.Equal(t, 2, settlements[0].InviteeId)
	require.Equal(t, 2*int(common.QuotaPerUnit), settlements[0].RewardQuota)
	require.Equal(t, 3, settlements[1].InviteeId)
	require.Equal(t, 48*int(common.QuotaPerUnit), settlements[1].RewardQuota)

	repeated, err := SettleAffiliateRebatesForDate(day, loc)
	require.NoError(t, err)
	require.Equal(t, 0, repeated.SettledCount)
	require.Equal(t, 0, repeated.TotalRewardQuota)

	require.NoError(t, DB.First(&inviter, 1).Error)
	require.Equal(t, 50*int(common.QuotaPerUnit), inviter.AffQuota)
	require.Equal(t, 50*int(common.QuotaPerUnit), inviter.AffHistoryQuota)
}

func TestCanUseAffiliateRebateHonorsGrayWhitelist(t *testing.T) {
	cfg := operation_setting.GetAffiliateRebateSetting()
	original := *cfg
	t.Cleanup(func() { *cfg = original })

	cfg.Enabled = false
	cfg.GrayEnabled = false
	cfg.GrayUserIds = ""
	require.False(t, operation_setting.CanUseAffiliateRebate(1))

	cfg.Enabled = true
	cfg.GrayEnabled = false
	require.True(t, operation_setting.CanUseAffiliateRebate(1))
	require.True(t, operation_setting.CanUseAffiliateRebate(2))

	cfg.GrayEnabled = true
	cfg.GrayUserIds = "1, 3\n5"
	require.True(t, operation_setting.CanUseAffiliateRebate(1))
	require.True(t, operation_setting.CanUseAffiliateRebate(3))
	require.True(t, operation_setting.CanUseAffiliateRebate(5))
	require.False(t, operation_setting.CanUseAffiliateRebate(2))
}

func TestSettleAffiliateRebatesForDateSkipsNonGrayWhitelistInviters(t *testing.T) {
	resetAffiliateRebateTables(t)
	loc := time.FixedZone("CST", 8*60*60)
	common.QuotaPerUnit = 500000

	cfg := operation_setting.GetAffiliateRebateSetting()
	original := *cfg
	t.Cleanup(func() { *cfg = original })
	cfg.Enabled = true
	cfg.Rate = 0.02
	cfg.DailyCapQuota = 0
	cfg.MinSettlementQuota = int(0.01 * common.QuotaPerUnit)
	cfg.StartTime = 0
	cfg.GrayEnabled = true
	cfg.GrayUserIds = "1"

	seedAffiliateUser(t, 1, "allowed_inviter", 0)
	seedAffiliateUser(t, 2, "blocked_inviter", 0)
	seedAffiliateUser(t, 3, "allowed_invitee", 1)
	seedAffiliateUser(t, 4, "blocked_invitee", 2)

	day := "2026-06-23"
	seedAffiliateConsumeLog(t, 3, "allowed_invitee", mustUnixInLocation(t, loc, "2026-06-23 10:00:00"), 100*int(common.QuotaPerUnit))
	seedAffiliateConsumeLog(t, 4, "blocked_invitee", mustUnixInLocation(t, loc, "2026-06-23 10:00:00"), 100*int(common.QuotaPerUnit))

	result, err := SettleAffiliateRebatesForDate(day, loc)
	require.NoError(t, err)
	require.Equal(t, 1, result.SettledCount)
	require.Equal(t, 2*int(common.QuotaPerUnit), result.TotalRewardQuota)

	var settlements []AffiliateRebateSettlement
	require.NoError(t, DB.Order("inviter_id asc").Find(&settlements).Error)
	require.Len(t, settlements, 1)
	require.Equal(t, 1, settlements[0].InviterId)
	require.Equal(t, 3, settlements[0].InviteeId)

	var blocked User
	require.NoError(t, DB.First(&blocked, 2).Error)
	require.Equal(t, 0, blocked.AffQuota)
	require.Equal(t, 0, blocked.AffHistoryQuota)
}
