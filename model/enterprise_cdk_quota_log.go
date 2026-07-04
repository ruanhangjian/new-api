package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	CdkQuotaLogTypeAdminAdd    = "admin_add"
	CdkQuotaLogTypeAdminDeduct = "admin_deduct"
	CdkQuotaLogTypeCreateCdk   = "create_cdk"
	CdkQuotaLogTypeAdminRefund = "admin_refund"
)

type EnterpriseCdkQuotaLog struct {
	Id              int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId          int    `json:"user_id" gorm:"index;not null"`
	OperatorId      int    `json:"operator_id" gorm:"default:0"`
	Type            string `json:"type" gorm:"type:varchar(32);not null"`
	Amount          int    `json:"amount" gorm:"type:int;not null"`
	BalanceBefore   int    `json:"balance_before" gorm:"type:int;not null"`
	BalanceAfter    int    `json:"balance_after" gorm:"type:int;not null"`
	RelatedBatchId  int    `json:"related_batch_id" gorm:"default:0"`
	RelatedCdkCount int    `json:"related_cdk_count" gorm:"default:0"`
	Remark          string `json:"remark" gorm:"type:varchar(512)"`
	CreatedTime     int64  `json:"created_time" gorm:"bigint;autoCreateTime"`
}

type EnterpriseCdkQuotaLogRow struct {
	EnterpriseCdkQuotaLog
	UserEmail     string `json:"user_email"`
	OperatorEmail string `json:"operator_email"`
	BatchName     string `json:"batch_name"`
}

func AdjustEnterpriseCdkQuota(tx *gorm.DB, userId int, operatorId int, logType string, amount int, batchId int, cdkCount int, remark string) error {
	if tx == nil {
		return errors.New("transaction 为空")
	}
	if userId <= 0 {
		return errors.New("user id 为空")
	}
	if amount == 0 {
		return errors.New("CDK 余额变动金额不能为 0")
	}
	if !isValidEnterpriseCdkQuotaLogType(logType) {
		return errors.New("无效的 CDK 余额流水类型")
	}

	var user User
	query := tx.Select("id", "enterprise_cdk_quota").Where("id = ?", userId)
	if !common.UsingSQLite {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	if err := query.First(&user).Error; err != nil {
		return err
	}

	newBalance, err := checkedEnterpriseCdkQuotaAdd(user.EnterpriseCdkQuota, amount)
	if err != nil {
		return err
	}
	if newBalance < 0 {
		return errors.New("CDK 余额不足")
	}
	if err := tx.Model(&User{}).Where("id = ?", userId).Update("enterprise_cdk_quota", newBalance).Error; err != nil {
		return err
	}

	log := &EnterpriseCdkQuotaLog{
		UserId:          userId,
		OperatorId:      operatorId,
		Type:            logType,
		Amount:          amount,
		BalanceBefore:   user.EnterpriseCdkQuota,
		BalanceAfter:    newBalance,
		RelatedBatchId:  batchId,
		RelatedCdkCount: cdkCount,
		Remark:          remark,
	}
	return tx.Create(log).Error
}

func checkedEnterpriseCdkQuotaAdd(balance int, amount int) (int, error) {
	maxInt := int(^uint(0) >> 1)
	minInt := -maxInt - 1
	if amount > 0 && balance > maxInt-amount {
		return 0, errors.New("CDK 余额过大")
	}
	if amount < 0 && balance < minInt-amount {
		return 0, errors.New("CDK 余额变动过大")
	}
	return balance + amount, nil
}

func isValidEnterpriseCdkQuotaLogType(logType string) bool {
	switch logType {
	case CdkQuotaLogTypeAdminAdd, CdkQuotaLogTypeAdminDeduct, CdkQuotaLogTypeCreateCdk, CdkQuotaLogTypeAdminRefund:
		return true
	default:
		return false
	}
}

func GetEnterpriseCdkQuotaLogs(userId int, startIdx, pageSize int) ([]*EnterpriseCdkQuotaLogRow, int64, error) {
	var logs []*EnterpriseCdkQuotaLogRow
	var total int64
	query := DB.Table("enterprise_cdk_quota_logs AS l").
		Joins("LEFT JOIN users AS u ON u.id = l.user_id").
		Joins("LEFT JOIN users AS op ON op.id = l.operator_id").
		Joins("LEFT JOIN enterprise_cdk_batches AS b ON b.id = l.related_batch_id")
	if userId > 0 {
		query = query.Where("l.user_id = ?", userId)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Select(`l.*, u.email AS user_email, op.email AS operator_email, b.name AS batch_name`).
		Order("l.id desc").
		Limit(pageSize).
		Offset(startIdx).
		Scan(&logs).Error
	return logs, total, err
}

type EnterpriseCdkQuotaSummary struct {
	TotalCharged  int `json:"total_charged_quota"`
	TotalConsumed int `json:"total_consumed_quota"`
	TotalRefunded int `json:"total_refunded_quota"`
}

func GetEnterpriseCdkQuotaSummary(userId int) (*EnterpriseCdkQuotaSummary, error) {
	var logs []EnterpriseCdkQuotaLog
	if err := DB.Where("user_id = ?", userId).Find(&logs).Error; err != nil {
		return nil, err
	}
	summary := &EnterpriseCdkQuotaSummary{}
	for _, log := range logs {
		switch log.Type {
		case CdkQuotaLogTypeAdminAdd:
			summary.TotalCharged += log.Amount
		case CdkQuotaLogTypeCreateCdk:
			summary.TotalConsumed += -log.Amount
		case CdkQuotaLogTypeAdminRefund:
			summary.TotalRefunded += log.Amount
		}
	}
	return summary, nil
}
