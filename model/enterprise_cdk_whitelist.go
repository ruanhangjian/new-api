package model

import (
	"errors"

	"gorm.io/gorm"
)

const (
	DefaultEnterpriseCdkMaxBatchCreateCount = 500
	EnterpriseCdkHardMaxBatchCreateCount    = 10000
)

type EnterpriseCdkWhitelist struct {
	Id                  int   `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId              int   `json:"user_id" gorm:"uniqueIndex;not null"`
	OperatorId          int   `json:"operator_id" gorm:"default:0"`
	MaxBatchCreateCount int   `json:"max_batch_create_count" gorm:"type:int;default:500"`
	CreatedTime         int64 `json:"created_time" gorm:"bigint;autoCreateTime"`
}

type EnterpriseCdkWhitelistUser struct {
	UserId              int    `json:"user_id"`
	Email               string `json:"email"`
	Username            string `json:"username"`
	EnterpriseCdkQuota  int    `json:"enterprise_cdk_quota"`
	CreatedTime         int64  `json:"created_time"`
	OperatorId          int    `json:"operator_id"`
	MaxBatchCreateCount int    `json:"max_batch_create_count"`
	TotalChargedQuota   int    `json:"total_charged_quota"`
	TotalConsumedQuota  int    `json:"total_consumed_quota"`
	LastChargedTime     int64  `json:"last_charged_time"`
}

func IsEnterpriseCdkWhitelisted(userId int) bool {
	if userId <= 0 {
		return false
	}
	var count int64
	if err := DB.Model(&EnterpriseCdkWhitelist{}).Where("user_id = ?", userId).Count(&count).Error; err != nil {
		return false
	}
	return count > 0
}

func GetEnterpriseCdkWhitelistPolicy(userId int) (*EnterpriseCdkWhitelist, error) {
	if userId <= 0 {
		return nil, errors.New("user id 为空")
	}
	var policy EnterpriseCdkWhitelist
	if err := DB.Where("user_id = ?", userId).First(&policy).Error; err != nil {
		return nil, err
	}
	if policy.MaxBatchCreateCount <= 0 {
		policy.MaxBatchCreateCount = DefaultEnterpriseCdkMaxBatchCreateCount
	}
	return &policy, nil
}

func ListEnterpriseCdkWhitelist(startIdx, pageSize int) ([]*EnterpriseCdkWhitelistUser, int64, error) {
	var users []*EnterpriseCdkWhitelistUser
	var total int64
	quotaSummary := DB.Model(&EnterpriseCdkQuotaLog{}).
		Select(`
			user_id,
			COALESCE(SUM(CASE WHEN type = ? THEN amount ELSE 0 END), 0) AS total_charged_quota,
			COALESCE(SUM(CASE WHEN type = ? THEN -amount ELSE 0 END), 0) AS total_consumed_quota,
			COALESCE(MAX(CASE WHEN type = ? THEN created_time ELSE 0 END), 0) AS last_charged_time
		`, CdkQuotaLogTypeAdminAdd, CdkQuotaLogTypeCreateCdk, CdkQuotaLogTypeAdminAdd).
		Group("user_id")
	query := DB.Table("enterprise_cdk_whitelists AS w").
		Joins("LEFT JOIN users AS u ON u.id = w.user_id").
		Joins("LEFT JOIN (?) AS qs ON qs.user_id = w.user_id", quotaSummary)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Select(`
			w.user_id,
			u.email,
			u.username,
			u.enterprise_cdk_quota,
			w.created_time,
			w.operator_id,
			w.max_batch_create_count,
			COALESCE(qs.total_charged_quota, 0) AS total_charged_quota,
			COALESCE(qs.total_consumed_quota, 0) AS total_consumed_quota,
			COALESCE(qs.last_charged_time, 0) AS last_charged_time
		`).
		Order("w.id desc").
		Limit(pageSize).
		Offset(startIdx).
		Scan(&users).Error
	return users, total, err
}

func AddEnterpriseCdkWhitelist(userId, operatorId int) error {
	return AddEnterpriseCdkWhitelistTx(DB, userId, operatorId)
}

func AddEnterpriseCdkWhitelistTx(tx *gorm.DB, userId, operatorId int) error {
	if userId <= 0 {
		return errors.New("user id 为空")
	}
	var user User
	if err := tx.Select("id").First(&user, "id = ?", userId).Error; err != nil {
		return err
	}
	var existing EnterpriseCdkWhitelist
	err := tx.Where("user_id = ?", userId).First(&existing).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return tx.Create(&EnterpriseCdkWhitelist{
		UserId:              userId,
		OperatorId:          operatorId,
		MaxBatchCreateCount: DefaultEnterpriseCdkMaxBatchCreateCount,
	}).Error
}

func RemoveEnterpriseCdkWhitelist(userId int) error {
	return RemoveEnterpriseCdkWhitelistTx(DB, userId)
}

func RemoveEnterpriseCdkWhitelistTx(tx *gorm.DB, userId int) error {
	if userId <= 0 {
		return errors.New("user id 为空")
	}
	return tx.Where("user_id = ?", userId).Delete(&EnterpriseCdkWhitelist{}).Error
}

func UpdateEnterpriseCdkWhitelistLimit(userId, maxCount int) error {
	if userId <= 0 {
		return errors.New("user id 为空")
	}
	if maxCount <= 0 {
		return errors.New("单次创建数量上限必须大于 0")
	}
	if maxCount > EnterpriseCdkHardMaxBatchCreateCount {
		return errors.New("单次创建数量不能超过 10000")
	}
	return DB.Model(&EnterpriseCdkWhitelist{}).Where("user_id = ?", userId).Update("max_batch_create_count", maxCount).Error
}
