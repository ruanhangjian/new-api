package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type EnterpriseCdkBatch struct {
	Id            int    `json:"id" gorm:"primaryKey;autoIncrement"`
	CreatorUserId int    `json:"creator_user_id" gorm:"index;not null"`
	Name          string `json:"name" gorm:"type:varchar(128);not null"`
	Remark        string `json:"remark" gorm:"type:varchar(512)"`
	Quota         int    `json:"quota" gorm:"type:bigint;not null"`
	Count         int    `json:"count" gorm:"not null"`
	TotalQuota    int    `json:"total_quota" gorm:"type:bigint;not null"`
	ExpiredTime   int64  `json:"expired_time" gorm:"bigint;default:0"`
	CreatedTime   int64  `json:"created_time" gorm:"bigint;autoCreateTime"`
}

type EnterpriseCdkBatchStats struct {
	BatchId       int `json:"batch_id"`
	TotalCount    int `json:"total_count"`
	UnusedCount   int `json:"unused_count"`
	UsedCount     int `json:"used_count"`
	ExpiredCount  int `json:"expired_count"`
	DisabledCount int `json:"disabled_count"`
}

type EnterpriseCdkUserSummary struct {
	BatchCount   int64 `json:"batch_count"`
	TotalCdks    int64 `json:"total_cdks"`
	RedeemedCdks int64 `json:"redeemed_cdks"`
	UnusedCdks   int64 `json:"unused_cdks"`
	ExpiredCdks  int64 `json:"expired_cdks"`
	DisabledCdks int64 `json:"disabled_cdks"`
}

type EnterpriseCdkQuotaTotals struct {
	CreatedQuota int `json:"created_quota"`
	UnusedQuota  int `json:"unused_quota"`
	UsedQuota    int `json:"used_quota"`
}

type EnterpriseCdkBatchRow struct {
	EnterpriseCdkBatch
	CreatorEmail  string                  `json:"creator_email"`
	CreatorName   string                  `json:"creator_name"`
	Stats         EnterpriseCdkBatchStats `json:"stats" gorm:"-:all"`
	UnusedCount   int                     `json:"unused_count"`
	UsedCount     int                     `json:"used_count"`
	ExpiredCount  int                     `json:"expired_count"`
	DisabledCount int                     `json:"disabled_count"`
}

func GetEnterpriseCdkBatchesByUser(userId, startIdx, pageSize int, keyword string) ([]*EnterpriseCdkBatchRow, int64, error) {
	return listEnterpriseCdkBatches(userId, startIdx, pageSize, keyword)
}

func GetAllEnterpriseCdkBatches(startIdx, pageSize int, creatorUserId int, keyword string) ([]*EnterpriseCdkBatchRow, int64, error) {
	return listEnterpriseCdkBatches(creatorUserId, startIdx, pageSize, keyword)
}

func listEnterpriseCdkBatches(creatorUserId, startIdx, pageSize int, keyword string) ([]*EnterpriseCdkBatchRow, int64, error) {
	var batches []*EnterpriseCdkBatchRow
	var total int64
	query := DB.Table("enterprise_cdk_batches AS b").
		Joins("LEFT JOIN users AS u ON u.id = b.creator_user_id")
	if creatorUserId > 0 {
		query = query.Where("b.creator_user_id = ?", creatorUserId)
	}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		pattern := enterpriseCdkBatchKeywordPattern(keyword)
		query = query.Where(
			"(LOWER(b.name) LIKE ? ESCAPE '!' OR LOWER(b.remark) LIKE ? ESCAPE '!')",
			pattern,
			pattern,
		)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Select(`b.*, u.email AS creator_email, u.username AS creator_name`).
		Order("b.id desc").
		Limit(pageSize).
		Offset(startIdx).
		Scan(&batches).Error
	if err != nil {
		return nil, 0, err
	}
	for _, batch := range batches {
		stats, err := GetEnterpriseCdkBatchStats(batch.Id)
		if err != nil {
			return nil, 0, err
		}
		batch.Stats = *stats
		batch.UnusedCount = stats.UnusedCount
		batch.UsedCount = stats.UsedCount
		batch.ExpiredCount = stats.ExpiredCount
		batch.DisabledCount = stats.DisabledCount
	}
	return batches, total, nil
}

func enterpriseCdkBatchKeywordPattern(keyword string) string {
	keyword = strings.ToLower(strings.TrimSpace(keyword))
	keyword = strings.ReplaceAll(keyword, "!", "!!")
	keyword = strings.ReplaceAll(keyword, "%", "!%")
	keyword = strings.ReplaceAll(keyword, "_", "!_")
	return "%" + keyword + "%"
}

func GetEnterpriseCdkBatchById(batchId, requesterUserId int, isAdmin bool) (*EnterpriseCdkBatchRow, error) {
	if batchId <= 0 {
		return nil, errors.New("批次 ID 为空")
	}
	var batch EnterpriseCdkBatchRow
	query := DB.Table("enterprise_cdk_batches AS b").
		Joins("LEFT JOIN users AS u ON u.id = b.creator_user_id").
		Select(`b.*, u.email AS creator_email, u.username AS creator_name`).
		Where("b.id = ?", batchId)
	if !isAdmin {
		query = query.Where("b.creator_user_id = ?", requesterUserId)
	}
	if err := query.First(&batch).Error; err != nil {
		return nil, err
	}
	stats, err := GetEnterpriseCdkBatchStats(batch.Id)
	if err != nil {
		return nil, err
	}
	batch.Stats = *stats
	batch.UnusedCount = stats.UnusedCount
	batch.UsedCount = stats.UsedCount
	batch.ExpiredCount = stats.ExpiredCount
	batch.DisabledCount = stats.DisabledCount
	return &batch, nil
}

func GetEnterpriseCdkBatchStats(batchId int) (*EnterpriseCdkBatchStats, error) {
	stats := &EnterpriseCdkBatchStats{BatchId: batchId}
	var redemptions []Redemption
	if err := DB.Where("batch_id = ?", batchId).Find(&redemptions).Error; err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	for _, redemption := range redemptions {
		stats.TotalCount++
		switch {
		case redemption.Status == common.RedemptionCodeStatusUsed:
			stats.UsedCount++
		case redemption.Status == common.RedemptionCodeStatusDisabled:
			stats.DisabledCount++
		case redemption.ExpiredTime != 0 && redemption.ExpiredTime < now:
			stats.ExpiredCount++
		default:
			stats.UnusedCount++
		}
	}
	return stats, nil
}

func GetEnterpriseCdkQuotaTotalsByUser(userId int) (*EnterpriseCdkQuotaTotals, error) {
	totals := &EnterpriseCdkQuotaTotals{}
	if err := DB.Model(&EnterpriseCdkBatch{}).
		Select("COALESCE(SUM(total_quota), 0)").
		Where("creator_user_id = ?", userId).
		Scan(&totals.CreatedQuota).Error; err != nil {
		return nil, err
	}
	if err := DB.Model(&Redemption{}).
		Select("COALESCE(SUM(quota), 0)").
		Where("user_id = ? AND batch_id > 0 AND status = ?", userId, common.RedemptionCodeStatusUsed).
		Scan(&totals.UsedQuota).Error; err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	if err := DB.Model(&Redemption{}).
		Select("COALESCE(SUM(quota), 0)").
		Where("user_id = ? AND batch_id > 0 AND status = ? AND (expired_time = 0 OR expired_time >= ?)", userId, common.RedemptionCodeStatusEnabled, now).
		Scan(&totals.UnusedQuota).Error; err != nil {
		return nil, err
	}
	return totals, nil
}

func GetEnterpriseCdkUserSummary(userId int) (*EnterpriseCdkUserSummary, error) {
	summary := &EnterpriseCdkUserSummary{}
	if err := DB.Model(&EnterpriseCdkBatch{}).Where("creator_user_id = ?", userId).Count(&summary.BatchCount).Error; err != nil {
		return nil, err
	}
	var redemptions []Redemption
	if err := DB.Where("user_id = ? AND batch_id > 0", userId).Find(&redemptions).Error; err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	for _, redemption := range redemptions {
		summary.TotalCdks++
		switch {
		case redemption.Status == common.RedemptionCodeStatusUsed:
			summary.RedeemedCdks++
		case redemption.Status == common.RedemptionCodeStatusDisabled:
			summary.DisabledCdks++
		case redemption.ExpiredTime != 0 && redemption.ExpiredTime < now:
			summary.ExpiredCdks++
		default:
			summary.UnusedCdks++
		}
	}
	return summary, nil
}
