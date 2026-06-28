package model

import (
	"errors"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AffiliateRebateSettlement struct {
	Id             int     `json:"id" gorm:"primaryKey"`
	InviterId      int     `json:"inviter_id" gorm:"uniqueIndex:idx_aff_rebate_day_pair,priority:2;index"`
	InviteeId      int     `json:"invitee_id" gorm:"uniqueIndex:idx_aff_rebate_day_pair,priority:3;index"`
	SettlementDate string  `json:"settlement_date" gorm:"type:varchar(10);uniqueIndex:idx_aff_rebate_day_pair,priority:1;index"`
	ConsumedQuota  int     `json:"consumed_quota" gorm:"default:0"`
	RewardQuota    int     `json:"reward_quota" gorm:"default:0"`
	Rate           float64 `json:"rate" gorm:"default:0"`
	Status         string  `json:"status" gorm:"type:varchar(16);default:'settled';index"`
	CreatedAt      int64   `json:"created_at" gorm:"bigint"`
	UpdatedAt      int64   `json:"updated_at" gorm:"bigint"`
}

const (
	AffiliateRebateStatusSettled = "settled"
)

type AffiliateRebateSettlementResult struct {
	SettlementDate   string `json:"settlement_date"`
	SettledCount     int    `json:"settled_count"`
	TotalRewardQuota int    `json:"total_reward_quota"`
}

type AffiliateRebateDailySettlementSummary struct {
	SettlementDate string `json:"settlement_date"`
	RewardQuota    int    `json:"reward_quota"`
}

type AffiliateInviteeSummary struct {
	UserId              int    `json:"user_id"`
	Username            string `json:"username"`
	DisplayName         string `json:"display_name"`
	RegisteredAt        int64  `json:"registered_at"`
	TodayConsumedQuota  int    `json:"today_consumed_quota"`
	TomorrowRewardQuota int    `json:"tomorrow_reward_quota"`
	TotalRewardQuota    int    `json:"total_reward_quota"`
	Status              string `json:"status"`
}

type AffiliateRebateOverview struct {
	Enabled            bool                      `json:"enabled"`
	Rate               float64                   `json:"rate"`
	DailyCapQuota      int                       `json:"daily_cap_quota"`
	MinSettlementQuota int                       `json:"min_settlement_quota"`
	StartTime          int64                     `json:"start_time"`
	PendingRewardQuota int                       `json:"pending_reward_quota"`
	TotalRewardQuota   int                       `json:"total_reward_quota"`
	InviteCount        int                       `json:"invite_count"`
	TodayRewardQuota   int                       `json:"today_reward_quota"`
	Invitees           []AffiliateInviteeSummary `json:"invitees"`
}

type affiliateInviteeBase struct {
	Id          int
	Username    string
	DisplayName string
	CreatedAt   int64
}

type affiliateQuotaSum struct {
	UserId int
	Quota  int
}

func affiliateDayBounds(date string, loc *time.Location) (int64, int64, error) {
	if loc == nil {
		loc = time.Local
	}
	day, err := time.ParseInLocation("2006-01-02", date, loc)
	if err != nil {
		return 0, 0, err
	}
	start := day.Unix()
	end := day.Add(24 * time.Hour).Unix()
	return start, end, nil
}

func calculateAffiliateRewardWithinRemainingCap(consumedQuota int, rate float64, remainingCap int, minSettlementQuota int) int {
	if consumedQuota <= 0 || rate <= 0 {
		return 0
	}
	reward := floorAffiliateRewardToCent(int(float64(consumedQuota) * rate))
	if remainingCap >= 0 && reward > remainingCap {
		reward = floorAffiliateRewardToCent(remainingCap)
	}
	if minSettlementQuota > 0 && reward < minSettlementQuota {
		return 0
	}
	return reward
}

func floorAffiliateRewardToCent(rewardQuota int) int {
	if rewardQuota <= 0 {
		return 0
	}
	centQuota := int(common.QuotaPerUnit / 100)
	if centQuota <= 0 {
		return rewardQuota
	}
	return rewardQuota / centQuota * centQuota
}

func getInviteeBases(inviterId int) ([]affiliateInviteeBase, error) {
	var rows []affiliateInviteeBase
	err := DB.Model(&User{}).
		Select("id, username, display_name, created_at").
		Where("inviter_id = ?", inviterId).
		Order("created_at desc, id desc").
		Find(&rows).Error
	return rows, err
}

func sumConsumeQuotaByUsers(userIds []int, startTs int64, endTs int64) (map[int]int, error) {
	result := make(map[int]int, len(userIds))
	if len(userIds) == 0 {
		return result, nil
	}
	var rows []affiliateQuotaSum
	err := LOG_DB.Model(&Log{}).
		Select("user_id, COALESCE(SUM(quota), 0) AS quota").
		Where("type = ? AND quota > 0 AND user_id IN ? AND created_at >= ? AND created_at < ?", LogTypeConsume, userIds, startTs, endTs).
		Group("user_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.UserId] = row.Quota
	}
	return result, nil
}

func sumSettledRewardsByInvitee(inviterId int) (map[int]int, error) {
	rows := []affiliateQuotaSum{}
	err := DB.Model(&AffiliateRebateSettlement{}).
		Select("invitee_id AS user_id, COALESCE(SUM(reward_quota), 0) AS quota").
		Where("inviter_id = ? AND status = ?", inviterId, AffiliateRebateStatusSettled).
		Group("invitee_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int]int, len(rows))
	for _, row := range rows {
		result[row.UserId] = row.Quota
	}
	return result, nil
}

func sumSettledRewardsByInviterForDate(date string) (map[int]int, error) {
	rows := []affiliateQuotaSum{}
	err := DB.Model(&AffiliateRebateSettlement{}).
		Select("inviter_id AS user_id, COALESCE(SUM(reward_quota), 0) AS quota").
		Where("settlement_date = ? AND status = ?", date, AffiliateRebateStatusSettled).
		Group("inviter_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int]int, len(rows))
	for _, row := range rows {
		result[row.UserId] = row.Quota
	}
	return result, nil
}

func SettleAffiliateRebatesForDate(date string, loc *time.Location) (AffiliateRebateSettlementResult, error) {
	cfg := operation_setting.GetAffiliateRebateSetting()
	result := AffiliateRebateSettlementResult{SettlementDate: date}
	if !cfg.Enabled {
		return result, nil
	}
	startTs, endTs, err := affiliateDayBounds(date, loc)
	if err != nil {
		return result, err
	}
	if cfg.StartTime > 0 {
		if endTs <= cfg.StartTime {
			return result, nil
		}
		if startTs < cfg.StartTime {
			startTs = cfg.StartTime
		}
	}

	var invitees []struct {
		Id        int
		InviterId int
		CreatedAt int64
	}
	if err := DB.Model(&User{}).
		Select("id, inviter_id, created_at").
		Where("inviter_id > 0").
		Find(&invitees).Error; err != nil {
		return result, err
	}
	if len(invitees) == 0 {
		return result, nil
	}
	sort.SliceStable(invitees, func(i, j int) bool {
		if invitees[i].InviterId == invitees[j].InviterId {
			if invitees[i].CreatedAt == invitees[j].CreatedAt {
				return invitees[i].Id > invitees[j].Id
			}
			return invitees[i].CreatedAt > invitees[j].CreatedAt
		}
		return invitees[i].InviterId < invitees[j].InviterId
	})

	userIds := make([]int, 0, len(invitees))
	for _, invitee := range invitees {
		userIds = append(userIds, invitee.Id)
	}
	consumeByUser, err := sumConsumeQuotaByUsers(userIds, startTs, endTs)
	if err != nil {
		return result, err
	}
	settledByInviter, err := sumSettledRewardsByInviterForDate(date)
	if err != nil {
		return result, err
	}

	now := time.Now().Unix()
	for _, invitee := range invitees {
		if !operation_setting.CanUseAffiliateRebate(invitee.InviterId) {
			continue
		}
		consumedQuota := consumeByUser[invitee.Id]
		if consumedQuota <= 0 {
			continue
		}
		remainingCap := -1
		if cfg.DailyCapQuota > 0 {
			remainingCap = cfg.DailyCapQuota - settledByInviter[invitee.InviterId]
			if remainingCap <= 0 {
				continue
			}
		}
		rewardQuota := calculateAffiliateRewardWithinRemainingCap(consumedQuota, cfg.Rate, remainingCap, cfg.MinSettlementQuota)
		inviterId := invitee.InviterId
		if inviterId <= 0 || rewardQuota <= 0 {
			continue
		}

		settlement := AffiliateRebateSettlement{
			InviterId:      inviterId,
			InviteeId:      invitee.Id,
			SettlementDate: date,
			ConsumedQuota:  consumedQuota,
			RewardQuota:    rewardQuota,
			Rate:           cfg.Rate,
			Status:         AffiliateRebateStatusSettled,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		err = DB.Transaction(func(tx *gorm.DB) error {
			create := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&settlement)
			if create.Error != nil {
				return create.Error
			}
			if create.RowsAffected == 0 {
				return nil
			}
			if err := tx.Model(&User{}).Where("id = ?", inviterId).Updates(map[string]interface{}{
				"aff_quota":   gorm.Expr("aff_quota + ?", rewardQuota),
				"aff_history": gorm.Expr("aff_history + ?", rewardQuota),
			}).Error; err != nil {
				return err
			}
			result.SettledCount++
			result.TotalRewardQuota += rewardQuota
			settledByInviter[inviterId] += rewardQuota
			return nil
		})
		if err != nil {
			return result, err
		}
	}

	return result, nil
}

func GetAffiliateRebateOverview(inviterId int, loc *time.Location) (AffiliateRebateOverview, error) {
	cfg := operation_setting.GetAffiliateRebateSetting()
	overview := AffiliateRebateOverview{
		Enabled:            cfg.Enabled,
		Rate:               cfg.Rate,
		DailyCapQuota:      cfg.DailyCapQuota,
		MinSettlementQuota: cfg.MinSettlementQuota,
		StartTime:          cfg.StartTime,
		Invitees:           []AffiliateInviteeSummary{},
	}
	var inviter User
	if err := DB.Select("aff_quota, aff_history, aff_count").First(&inviter, inviterId).Error; err != nil {
		return overview, err
	}
	overview.PendingRewardQuota = inviter.AffQuota
	overview.TotalRewardQuota = inviter.AffHistoryQuota
	overview.InviteCount = inviter.AffCount

	invitees, err := getInviteeBases(inviterId)
	if err != nil {
		return overview, err
	}
	if len(invitees) == 0 {
		return overview, nil
	}

	userIds := make([]int, 0, len(invitees))
	for _, invitee := range invitees {
		userIds = append(userIds, invitee.Id)
	}

	now := time.Now()
	if loc == nil {
		loc = time.Local
	}
	today := now.In(loc).Format("2006-01-02")
	startTs, endTs, err := affiliateDayBounds(today, loc)
	if err != nil {
		return overview, err
	}
	if cfg.StartTime > 0 && startTs < cfg.StartTime {
		startTs = cfg.StartTime
	}
	consumeByUser, err := sumConsumeQuotaByUsers(userIds, startTs, endTs)
	if err != nil {
		return overview, err
	}
	settledByInvitee, err := sumSettledRewardsByInvitee(inviterId)
	if err != nil {
		return overview, err
	}

	overview.Invitees = make([]AffiliateInviteeSummary, 0, len(invitees))
	remainingCap := -1
	if cfg.DailyCapQuota > 0 {
		remainingCap = cfg.DailyCapQuota
	}
	for _, invitee := range invitees {
		consumed := consumeByUser[invitee.Id]
		reward := calculateAffiliateRewardWithinRemainingCap(consumed, cfg.Rate, remainingCap, cfg.MinSettlementQuota)
		status := "inactive"
		if consumed > 0 && reward == 0 {
			status = "below_minimum"
		} else if reward > 0 {
			status = "pending"
		}
		overview.TodayRewardQuota += reward
		if remainingCap >= 0 {
			remainingCap -= reward
		}
		overview.Invitees = append(overview.Invitees, AffiliateInviteeSummary{
			UserId:              invitee.Id,
			Username:            invitee.Username,
			DisplayName:         invitee.DisplayName,
			RegisteredAt:        invitee.CreatedAt,
			TodayConsumedQuota:  consumed,
			TomorrowRewardQuota: reward,
			TotalRewardQuota:    settledByInvitee[invitee.Id],
			Status:              status,
		})
	}
	sort.SliceStable(overview.Invitees, func(i, j int) bool {
		if overview.Invitees[i].TomorrowRewardQuota == overview.Invitees[j].TomorrowRewardQuota {
			return overview.Invitees[i].UserId > overview.Invitees[j].UserId
		}
		return overview.Invitees[i].TomorrowRewardQuota > overview.Invitees[j].TomorrowRewardQuota
	})
	return overview, nil
}

func CanUseAffiliateRebate(userId int) bool {
	return operation_setting.CanUseAffiliateRebate(userId)
}

func GetAffiliateRebateSettlements(inviterId int, inviteeId int, limit int) ([]AffiliateRebateSettlement, error) {
	if limit <= 0 || limit > 30 {
		limit = 7
	}
	if inviterId <= 0 || inviteeId <= 0 {
		return nil, errors.New("invalid inviter or invitee id")
	}
	var rows []AffiliateRebateSettlement
	err := DB.Where("inviter_id = ? AND invitee_id = ?", inviterId, inviteeId).
		Order("settlement_date desc").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func GetAffiliateRebateDailySettlements(inviterId int, limit int) ([]AffiliateRebateDailySettlementSummary, error) {
	if limit <= 0 || limit > 30 {
		limit = 30
	}
	if inviterId <= 0 {
		return nil, errors.New("invalid inviter id")
	}
	var rows []AffiliateRebateDailySettlementSummary
	err := DB.Model(&AffiliateRebateSettlement{}).
		Select("settlement_date, COALESCE(SUM(reward_quota), 0) AS reward_quota").
		Where("inviter_id = ? AND status = ?", inviterId, AffiliateRebateStatusSettled).
		Group("settlement_date").
		Order("settlement_date desc").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}
