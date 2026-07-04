package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
)

type EnterpriseCdkBatch struct {
	Id            int    `json:"id" gorm:"primaryKey;autoIncrement"`
	CreatorUserId int    `json:"creator_user_id" gorm:"index;not null"`
	Name          string `json:"name" gorm:"type:varchar(128);not null"`
	Remark        string `json:"remark" gorm:"type:varchar(512)"`
	Quota         int    `json:"quota" gorm:"type:int;not null"`
	Count         int    `json:"count" gorm:"not null"`
	TotalQuota    int    `json:"total_quota" gorm:"type:int;not null"`
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

func GetEnterpriseCdkBatchesByUser(userId, startIdx, pageSize int) ([]*EnterpriseCdkBatchRow, int64, error) {
	return listEnterpriseCdkBatches(userId, startIdx, pageSize)
}

func GetAllEnterpriseCdkBatches(startIdx, pageSize int, creatorUserId int) ([]*EnterpriseCdkBatchRow, int64, error) {
	return listEnterpriseCdkBatches(creatorUserId, startIdx, pageSize)
}

func listEnterpriseCdkBatches(creatorUserId, startIdx, pageSize int) ([]*EnterpriseCdkBatchRow, int64, error) {
	var batches []*EnterpriseCdkBatchRow
	var total int64
	query := DB.Table("enterprise_cdk_batches AS b").
		Joins("LEFT JOIN users AS u ON u.id = b.creator_user_id")
	if creatorUserId > 0 {
		query = query.Where("b.creator_user_id = ?", creatorUserId)
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
