package model

type EnterpriseCdkOperationLog struct {
	Id             int    `json:"id" gorm:"primaryKey;autoIncrement"`
	OperatorId     int    `json:"operator_id" gorm:"index;default:0"`
	TargetUserId   int    `json:"target_user_id" gorm:"index;default:0"`
	Action         string `json:"action" gorm:"type:varchar(64);not null"`
	BatchId        int    `json:"batch_id" gorm:"index;default:0"`
	CdkCount       int    `json:"cdk_count" gorm:"default:0"`
	RequestSummary string `json:"request_summary" gorm:"type:varchar(1024)"`
	Remark         string `json:"remark" gorm:"type:varchar(512)"`
	CreatedTime    int64  `json:"created_time" gorm:"bigint;autoCreateTime"`
}

const (
	EnterpriseCdkOperationExportUser      = "export_user"
	EnterpriseCdkOperationExportAdmin     = "export_admin"
	EnterpriseCdkOperationCopyUnused      = "copy_unused"
	EnterpriseCdkOperationRecycleCdks     = "recycle_cdks"
	EnterpriseCdkOperationToggleCdk       = "toggle_cdk"
	EnterpriseCdkOperationWhitelistAdd    = "whitelist_add"
	EnterpriseCdkOperationWhitelistRemove = "whitelist_remove"
	EnterpriseCdkOperationLimitUpdate     = "limit_update"
)

type EnterpriseCdkOperationLogRow struct {
	EnterpriseCdkOperationLog
	OperatorEmail   string `json:"operator_email"`
	TargetUserEmail string `json:"target_user_email"`
	BatchName       string `json:"batch_name"`
}

func CreateEnterpriseCdkOperationLog(log *EnterpriseCdkOperationLog) error {
	return DB.Create(log).Error
}

func GetEnterpriseCdkOperationLogs(startIdx, pageSize int, targetUserId int, action string) ([]*EnterpriseCdkOperationLogRow, int64, error) {
	var logs []*EnterpriseCdkOperationLogRow
	var total int64
	query := DB.Table("enterprise_cdk_operation_logs AS l").
		Joins("LEFT JOIN users AS op ON op.id = l.operator_id").
		Joins("LEFT JOIN users AS target ON target.id = l.target_user_id").
		Joins("LEFT JOIN enterprise_cdk_batches AS b ON b.id = l.batch_id")
	if targetUserId > 0 {
		query = query.Where("l.target_user_id = ?", targetUserId)
	}
	if action != "" {
		query = query.Where("l.action = ?", action)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Select(`l.*, op.email AS operator_email, target.email AS target_user_email, b.name AS batch_name`).
		Order("l.id desc").
		Limit(pageSize).
		Offset(startIdx).
		Scan(&logs).Error
	return logs, total, err
}
