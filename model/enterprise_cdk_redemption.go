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
	UsedUserDisplay      string `json:"used_user_display"`
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
	query := buildEnterpriseCdkRedemptionsQuery(creatorUserId, batchId, nil, status, keyword, createdStart, createdEnd)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("r.id desc").Limit(pageSize).Offset(startIdx).Scan(&rows).Error
	return rows, total, err
}

func GetEnterpriseCdkRedemptionsForExport(creatorUserId int, batchId int, cdkIds []int, status string, keyword string, createdStart int64, createdEnd int64) ([]*EnterpriseCdkExportRow, error) {
	var rows []*EnterpriseCdkExportRow
	err := buildEnterpriseCdkRedemptionsQuery(creatorUserId, batchId, cdkIds, status, keyword, createdStart, createdEnd).
		Order("r.id asc").
		Scan(&rows).Error
	return rows, err
}

func buildEnterpriseCdkRedemptionsQuery(creatorUserId int, batchId int, cdkIds []int, status string, keyword string, createdStart int64, createdEnd int64) *gorm.DB {
	query := enterpriseCdkRedemptionRowsQuery().Where("r.batch_id > 0")
	if creatorUserId > 0 {
		query = query.Where("r.user_id = ?", creatorUserId)
	}
	if batchId > 0 {
		query = query.Where("r.batch_id = ?", batchId)
	}
	if len(cdkIds) > 0 {
		query = query.Where("r.id IN ?", cdkIds)
	}
	if createdStart > 0 {
		query = query.Where("r.created_time >= ?", createdStart)
	}
	if createdEnd > 0 {
		query = query.Where("r.created_time <= ?", createdEnd)
	}
	return applyEnterpriseCdkRedemptionFilters(query, status, keyword)
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
			r.used_user_id, used.email AS used_user_email,
			COALESCE(NULLIF(TRIM(used.profile_remark), ''), NULLIF(TRIM(used.email), ''), NULLIF(TRIM(used.username), '')) AS used_user_display,
			r.recycled_time, r.recycle_operator_id,
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
		eligibleStatuses := []int{common.RedemptionCodeStatusEnabled, common.RedemptionCodeStatusDisabled}
		query := tx.Where("id IN ? AND batch_id > 0 AND status IN ? AND used_user_id = 0 AND redeemed_time = 0 AND recycled_time = 0 AND quota > 0", cdkIds, eligibleStatuses)
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
		type operationKey struct {
			userId  int
			batchId int
		}
		type operationBucket struct {
			count int
			ids   []int
		}
		byUser := make(map[int]refundBucket)
		byOperation := make(map[operationKey]operationBucket)
		for _, code := range codes {
			result := tx.Model(&Redemption{}).
				Where("id = ? AND batch_id > 0 AND user_id = ? AND quota = ? AND status IN ? AND used_user_id = 0 AND redeemed_time = 0 AND recycled_time = 0", code.Id, code.UserId, code.Quota, eligibleStatuses).
				Updates(map[string]any{
					"status":                 common.RedemptionCodeStatusDisabled,
					"recycled_time":          now,
					"recycle_operator_id":    operatorId,
					"recycle_quota_returned": gorm.Expr("quota"),
				})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			eligibleIds = append(eligibleIds, code.Id)
			refundedCount++
			var err error
			refundedQuota, err = checkedEnterpriseCdkQuotaAdd(refundedQuota, code.Quota)
			if err != nil {
				return err
			}
			bucket := byUser[code.UserId]
			bucket.quota, err = checkedEnterpriseCdkQuotaAdd(bucket.quota, code.Quota)
			if err != nil {
				return err
			}
			bucket.count++
			byUser[code.UserId] = bucket

			opKey := operationKey{userId: code.UserId, batchId: code.BatchId}
			opBucket := byOperation[opKey]
			opBucket.count++
			opBucket.ids = append(opBucket.ids, code.Id)
			byOperation[opKey] = opBucket
		}
		if refundedCount == 0 {
			return nil
		}

		for userId, bucket := range byUser {
			if err := AdjustEnterpriseCdkQuota(tx, userId, operatorId, CdkQuotaLogTypeAdminRefund, bucket.quota, 0, bucket.count, remark); err != nil {
				return err
			}
		}

		logs := make([]EnterpriseCdkOperationLog, 0, len(byOperation))
		for key, bucket := range byOperation {
			logs = append(logs, EnterpriseCdkOperationLog{
				OperatorId:     operatorId,
				TargetUserId:   key.userId,
				Action:         EnterpriseCdkOperationRecycleCdks,
				BatchId:        key.batchId,
				CdkCount:       bucket.count,
				RequestSummary: fmt.Sprintf("ids=%v all_ids=%v", bucket.ids, eligibleIds),
				Remark:         remark,
			})
		}
		return tx.Create(&logs).Error
	})
	if err != nil {
		return 0, 0, err
	}
	return refundedCount, refundedQuota, nil
}
