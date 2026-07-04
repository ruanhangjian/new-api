package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type EnterpriseCdkExportRow struct {
	Id                   int    `json:"id"`
	UserId               int    `json:"user_id"`
	BatchId              int    `json:"batch_id"`
	BatchName            string `json:"batch_name"`
	CreatorEmail         string `json:"creator_email"`
	Key                  string `json:"key"`
	Name                 string `json:"name"`
	Quota                int    `json:"quota"`
	Status               int    `json:"status"`
	CreatedTime          int64  `json:"created_time"`
	RedeemedTime         int64  `json:"redeemed_time"`
	ExpiredTime          int64  `json:"expired_time"`
	UsedUserId           int    `json:"used_user_id"`
	UsedUserEmail        string `json:"used_user_email"`
	RecycledTime         int64  `json:"recycled_time"`
	RecycleOperatorId    int    `json:"recycle_operator_id"`
	RecycleQuotaReturned int    `json:"recycle_quota_returned"`
}

func GetRedemptionsForExport(userId int, batchId int, cdkIds []int, isAdmin bool) ([]*EnterpriseCdkExportRow, error) {
	var rows []*EnterpriseCdkExportRow
	query := enterpriseCdkRedemptionRowsQuery().Where("r.batch_id > 0")
	if !isAdmin {
		query = query.Where("r.user_id = ?", userId)
	}
	if batchId > 0 {
		query = query.Where("r.batch_id = ?", batchId)
	}
	if len(cdkIds) > 0 {
		query = query.Where("r.id IN ?", cdkIds)
	}
	err := query.Order("r.id asc").Scan(&rows).Error
	return rows, err
}

func GetUnusedEnterpriseCdkCodesForCopy(batchId int) ([]*EnterpriseCdkExportRow, error) {
	var rows []*EnterpriseCdkExportRow
	now := common.GetTimestamp()
	err := enterpriseCdkRedemptionRowsQuery().
		Where("r.batch_id = ? AND r.status = ? AND (r.expired_time = 0 OR r.expired_time >= ?)", batchId, common.RedemptionCodeStatusEnabled, now).
		Order("r.id asc").
		Scan(&rows).Error
	return rows, err
}

func GetRedemptionsByBatch(batchId int, status string, keyword string, startIdx, pageSize int) ([]*EnterpriseCdkExportRow, int64, error) {
	var rows []*EnterpriseCdkExportRow
	var total int64
	query := enterpriseCdkRedemptionRowsQuery().Where("r.batch_id = ?", batchId)
	query = applyEnterpriseCdkRedemptionFilters(query, status, keyword)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("r.id desc").Limit(pageSize).Offset(startIdx).Scan(&rows).Error
	return rows, total, err
}

func GetEnterpriseCdkRedemptions(startIdx, pageSize int, creatorUserId int, batchId int, status string, keyword string, createdStart int64, createdEnd int64) ([]*EnterpriseCdkExportRow, int64, error) {
	var rows []*EnterpriseCdkExportRow
	var total int64
	query := enterpriseCdkRedemptionRowsQuery().Where("r.batch_id > 0")
	if creatorUserId > 0 {
		query = query.Where("r.user_id = ?", creatorUserId)
	}
	if batchId > 0 {
		query = query.Where("r.batch_id = ?", batchId)
	}
	if createdStart > 0 {
		query = query.Where("r.created_time >= ?", createdStart)
	}
	if createdEnd > 0 {
		query = query.Where("r.created_time <= ?", createdEnd)
	}
	query = applyEnterpriseCdkRedemptionFilters(query, status, keyword)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("r.id desc").Limit(pageSize).Offset(startIdx).Scan(&rows).Error
	return rows, total, err
}

func enterpriseCdkRedemptionRowsQuery() *gorm.DB {
	keyExpr := fmt.Sprintf("r.%s", enterpriseCdkKeyColumn())
	return DB.Table("redemptions AS r").
		Joins("LEFT JOIN enterprise_cdk_batches AS b ON b.id = r.batch_id").
		Joins("LEFT JOIN users AS creator ON creator.id = r.user_id").
		Joins("LEFT JOIN users AS used ON used.id = r.used_user_id").
		Where("r.deleted_at IS NULL").
		Select(fmt.Sprintf(`r.id, r.user_id, r.batch_id, b.name AS batch_name, creator.email AS creator_email,
			%s AS key, r.name, r.quota, r.status, r.created_time, r.redeemed_time, r.expired_time,
			r.used_user_id, used.email AS used_user_email, r.recycled_time, r.recycle_operator_id,
			r.recycle_quota_returned`, keyExpr))
}

func applyEnterpriseCdkRedemptionFilters(query *gorm.DB, status string, keyword string) *gorm.DB {
	now := common.GetTimestamp()
	switch status {
	case "unused", "enabled":
		query = query.Where("r.status = ? AND (r.expired_time = 0 OR r.expired_time >= ?)", common.RedemptionCodeStatusEnabled, now)
	case "used":
		query = query.Where("r.status = ?", common.RedemptionCodeStatusUsed)
	case "expired":
		query = query.Where("r.status = ? AND r.expired_time != 0 AND r.expired_time < ?", common.RedemptionCodeStatusEnabled, now)
	case "disabled":
		query = query.Where("r.status = ?", common.RedemptionCodeStatusDisabled)
	}
	if keyword != "" {
		query = query.Where(fmt.Sprintf("r.%s LIKE ?", enterpriseCdkKeyColumn()), "%"+keyword+"%")
	}
	return query
}

func enterpriseCdkKeyColumn() string {
	if commonKeyCol != "" {
		return commonKeyCol
	}
	if common.UsingPostgreSQL {
		return `"key"`
	}
	return "`key`"
}

func RecycleEnterpriseCdkCodes(cdkIds []int, operatorId int, remark string) (int, int, error) {
	if len(cdkIds) == 0 {
		return 0, 0, nil
	}
	var refundedCount int
	var refundedQuota int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var codes []Redemption
		now := common.GetTimestamp()
		query := tx.Where("id IN ? AND batch_id > 0 AND status = ? AND used_user_id = 0 AND recycled_time = 0 AND (expired_time = 0 OR expired_time >= ?)", cdkIds, common.RedemptionCodeStatusEnabled, now)
		if !common.UsingSQLite {
			query = query.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		if err := query.Find(&codes).Error; err != nil {
			return err
		}
		if len(codes) == 0 {
			return nil
		}
		eligibleIds := make([]int, 0, len(codes))
		type refundBucket struct {
			quota int
			count int
		}
		byUser := make(map[int]refundBucket)
		for _, code := range codes {
			eligibleIds = append(eligibleIds, code.Id)
			refundedCount++
			refundedQuota += code.Quota
			bucket := byUser[code.UserId]
			bucket.quota += code.Quota
			bucket.count++
			byUser[code.UserId] = bucket
		}

		if err := tx.Model(&Redemption{}).Where("id IN ?", eligibleIds).Updates(map[string]any{
			"status":                 common.RedemptionCodeStatusDisabled,
			"recycled_time":          now,
			"recycle_operator_id":    operatorId,
			"recycle_quota_returned": gorm.Expr("quota"),
		}).Error; err != nil {
			return err
		}

		for userId, bucket := range byUser {
			if err := AdjustEnterpriseCdkQuota(tx, userId, operatorId, CdkQuotaLogTypeAdminRefund, bucket.quota, 0, bucket.count, remark); err != nil {
				return err
			}
		}

		return tx.Create(&EnterpriseCdkOperationLog{
			OperatorId:     operatorId,
			Action:         EnterpriseCdkOperationRecycleCdks,
			CdkCount:       refundedCount,
			RequestSummary: fmt.Sprintf("ids=%v", eligibleIds),
			Remark:         remark,
		}).Error
	})
	if err != nil {
		return 0, 0, err
	}
	return refundedCount, refundedQuota, nil
}
