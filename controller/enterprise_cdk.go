package controller

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type createEnterpriseCdkBatchRequest struct {
	Name        string `json:"name" binding:"required"`
	Remark      string `json:"remark"`
	Quota       string `json:"quota" binding:"required"`
	Count       int    `json:"count" binding:"required"`
	ExpiredTime int64  `json:"expired_time"`
}

type enterpriseCdkExportRequest struct {
	BatchId      int    `json:"batch_id"`
	CdkIds       []int  `json:"cdk_ids"`
	UserId       int    `json:"user_id"`
	Status       string `json:"status"`
	Keyword      string `json:"keyword"`
	CreatedStart int64  `json:"created_start"`
	CreatedEnd   int64  `json:"created_end"`
}

func enterpriseCdkForbidden(c *gin.Context) {
	c.JSON(http.StatusForbidden, gin.H{
		"success": false,
		"message": "no permission",
	})
}

func EnterpriseCdkPermission(c *gin.Context) {
	userId := c.GetInt("id")
	hasPermission := service.IsEnterpriseCdkUser(userId)
	data := gin.H{"has_permission": hasPermission}
	if hasPermission {
		policy, err := service.GetEnterpriseCdkWhitelistPolicy(userId)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		data["max_batch_create_count"] = policy.MaxBatchCreateCount
	}
	common.ApiSuccess(c, data)
}

func EnterpriseCdkBalance(c *gin.Context) {
	userId := c.GetInt("id")
	if !service.IsEnterpriseCdkUser(userId) {
		enterpriseCdkForbidden(c)
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	totals, err := model.GetEnterpriseCdkQuotaTotalsByUser(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"balance":       service.QuotaToUSDString(user.EnterpriseCdkQuota),
		"balance_quota": user.EnterpriseCdkQuota,
		"created_quota": totals.CreatedQuota,
		"unused_quota":  totals.UnusedQuota,
		"used_quota":    totals.UsedQuota,
	})
}

func EnterpriseCdkBalanceLogs(c *gin.Context) {
	userId := c.GetInt("id")
	if !service.IsEnterpriseCdkUser(userId) {
		enterpriseCdkForbidden(c)
		return
	}
	pageInfo := common.GetPageQuery(c)
	logs, total, err := model.GetEnterpriseCdkQuotaLogs(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), c.Query("type"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}

func EnterpriseCdkBatches(c *gin.Context) {
	userId := c.GetInt("id")
	if !service.IsEnterpriseCdkUser(userId) {
		enterpriseCdkForbidden(c)
		return
	}
	pageInfo := common.GetPageQuery(c)
	batches, total, err := model.GetEnterpriseCdkBatchesByUser(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), c.Query("keyword"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(batches)
	common.ApiSuccess(c, pageInfo)
}

func EnterpriseCdkBatchDetail(c *gin.Context) {
	userId := c.GetInt("id")
	if !service.IsEnterpriseCdkUser(userId) {
		enterpriseCdkForbidden(c)
		return
	}
	batchId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	batch, err := model.GetEnterpriseCdkBatchById(batchId, userId, false)
	if err != nil {
		enterpriseCdkForbidden(c)
		return
	}
	pageInfo := common.GetPageQuery(c)
	cdks, total, err := model.GetRedemptionsByBatch(batchId, c.Query("status"), c.Query("keyword"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(cdks)
	common.ApiSuccess(c, gin.H{
		"batch": batch,
		"cdks":  pageInfo,
	})
}

func CreateEnterpriseCdkBatch(c *gin.Context) {
	userId := c.GetInt("id")
	if !service.IsEnterpriseCdkUser(userId) {
		enterpriseCdkForbidden(c)
		return
	}
	var req createEnterpriseCdkBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || utf8.RuneCountInString(req.Name) > 128 {
		common.ApiError(c, errors.New("批次名称不能为空且不能超过 128 个字符"))
		return
	}
	if req.Count <= 0 {
		common.ApiError(c, errors.New("创建数量必须大于 0"))
		return
	}
	if req.Count > model.EnterpriseCdkHardMaxBatchCreateCount {
		common.ApiError(c, fmt.Errorf("单次创建数量不能超过 %d", model.EnterpriseCdkHardMaxBatchCreateCount))
		return
	}
	if req.ExpiredTime != 0 && req.ExpiredTime < common.GetTimestamp() {
		common.ApiError(c, errors.New("过期时间不能早于当前时间"))
		return
	}
	req.Remark = strings.TrimSpace(req.Remark)
	if utf8.RuneCountInString(req.Remark) > 512 {
		common.ApiError(c, errors.New("批次备注不能超过 512 个字符"))
		return
	}
	policy, err := service.GetEnterpriseCdkWhitelistPolicy(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Count > policy.MaxBatchCreateCount {
		common.ApiError(c, fmt.Errorf("单次最多创建 %d 个 CDK", policy.MaxBatchCreateCount))
		return
	}
	unitQuota, err := service.USDStringToQuota(req.Quota)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	totalQuota, err := checkedEnterpriseCdkTotalQuota(unitQuota, req.Count)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	var batch *model.EnterpriseCdkBatch
	createdCdks := make([]model.Redemption, 0, req.Count)
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		now := common.GetTimestamp()
		batch = &model.EnterpriseCdkBatch{
			CreatorUserId: userId,
			Name:          req.Name,
			Remark:        req.Remark,
			Quota:         unitQuota,
			Count:         req.Count,
			TotalQuota:    totalQuota,
			ExpiredTime:   req.ExpiredTime,
			CreatedTime:   now,
		}
		if err := tx.Create(batch).Error; err != nil {
			return err
		}
		if err := model.AdjustEnterpriseCdkQuota(tx, userId, 0, model.CdkQuotaLogTypeCreateCdk, -totalQuota, batch.Id, req.Count, ""); err != nil {
			return err
		}
		for i := 0; i < req.Count; i++ {
			createdCdks = append(createdCdks, model.Redemption{
				UserId:      userId,
				BatchId:     batch.Id,
				Key:         common.GetUUID(),
				Name:        req.Name,
				Quota:       unitQuota,
				Status:      common.RedemptionCodeStatusEnabled,
				CreatedTime: now,
				ExpiredTime: req.ExpiredTime,
			})
		}
		return tx.CreateInBatches(&createdCdks, 100).Error
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"batch": batch,
		"cdks":  createdCdks,
	})
}

func EnterpriseCdkExport(c *gin.Context) {
	userId := c.GetInt("id")
	if !service.IsEnterpriseCdkUser(userId) {
		enterpriseCdkForbidden(c)
		return
	}
	var req enterpriseCdkExportRequest
	if !bindEnterpriseCdkExportRequest(c, &req) {
		return
	}
	rows, err := model.GetRedemptionsForExport(userId, req.BatchId, req.CdkIds, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.CreateEnterpriseCdkOperationLog(&model.EnterpriseCdkOperationLog{
		OperatorId:     userId,
		TargetUserId:   userId,
		Action:         model.EnterpriseCdkOperationExportUser,
		BatchId:        req.BatchId,
		CdkCount:       len(rows),
		RequestSummary: fmt.Sprintf("batch_id=%d ids=%v", req.BatchId, req.CdkIds),
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	writeEnterpriseCdkCSV(c, rows, false)
}

func EnterpriseCdkCopyUnusedLog(c *gin.Context) {
	userId := c.GetInt("id")
	if !service.IsEnterpriseCdkUser(userId) {
		enterpriseCdkForbidden(c)
		return
	}
	var req struct {
		BatchId int `json:"batch_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	batch, err := model.GetEnterpriseCdkBatchById(req.BatchId, userId, false)
	if err != nil {
		enterpriseCdkForbidden(c)
		return
	}
	rows, err := model.GetUnusedEnterpriseCdkCodesForCopy(batch.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	err = model.CreateEnterpriseCdkOperationLog(&model.EnterpriseCdkOperationLog{
		OperatorId:   userId,
		TargetUserId: userId,
		Action:       model.EnterpriseCdkOperationCopyUnused,
		BatchId:      batch.Id,
		CdkCount:     len(rows),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	codes := make([]string, 0, len(rows))
	for _, row := range rows {
		codes = append(codes, row.Key)
	}
	common.ApiSuccess(c, gin.H{
		"codes": codes,
		"count": len(codes),
	})
}

func AdminGetEnterpriseCdkWhitelist(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	users, total, err := service.ListEnterpriseCdkWhitelist(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(users)
	common.ApiSuccess(c, pageInfo)
}

func AdminUpdateEnterpriseCdkWhitelist(c *gin.Context) {
	var req struct {
		Action string `json:"action" binding:"required"`
		UserId int    `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	operatorId := c.GetInt("id")
	if req.Action != "add" && req.Action != "remove" {
		common.ApiError(c, errors.New("action 必须为 add 或 remove"))
		return
	}
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if req.Action == "add" {
			if err := model.AddEnterpriseCdkWhitelistTx(tx, req.UserId, operatorId); err != nil {
				return err
			}
			return tx.Create(&model.EnterpriseCdkOperationLog{OperatorId: operatorId, TargetUserId: req.UserId, Action: model.EnterpriseCdkOperationWhitelistAdd}).Error
		}
		if err := model.RemoveEnterpriseCdkWhitelistTx(tx, req.UserId); err != nil {
			return err
		}
		return tx.Create(&model.EnterpriseCdkOperationLog{OperatorId: operatorId, TargetUserId: req.UserId, Action: model.EnterpriseCdkOperationWhitelistRemove}).Error
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminUpdateEnterpriseCdkWhitelistLimit(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req struct {
		MaxBatchCreateCount int `json:"max_batch_create_count" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.MaxBatchCreateCount <= 0 {
		common.ApiError(c, errors.New("单次创建数量上限必须大于 0"))
		return
	}
	if req.MaxBatchCreateCount > model.EnterpriseCdkHardMaxBatchCreateCount {
		common.ApiError(c, fmt.Errorf("单次创建数量不能超过 %d", model.EnterpriseCdkHardMaxBatchCreateCount))
		return
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.EnterpriseCdkWhitelist{}).Where("user_id = ?", userId).Update("max_batch_create_count", req.MaxBatchCreateCount)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("白名单用户不存在")
		}
		return tx.Create(&model.EnterpriseCdkOperationLog{
			OperatorId:     c.GetInt("id"),
			TargetUserId:   userId,
			Action:         model.EnterpriseCdkOperationLimitUpdate,
			RequestSummary: fmt.Sprintf("max_batch_create_count=%d", req.MaxBatchCreateCount),
		}).Error
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminGetEnterpriseCdkBalance(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"user_id":       user.Id,
		"email":         user.Email,
		"balance":       service.QuotaToUSDString(user.EnterpriseCdkQuota),
		"balance_quota": user.EnterpriseCdkQuota,
	})
}

func AdminAdjustEnterpriseCdkBalance(c *gin.Context) {
	var req struct {
		UserId int    `json:"user_id" binding:"required"`
		Amount string `json:"amount" binding:"required"`
		Type   string `json:"type" binding:"required"`
		Remark string `json:"remark" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	req.Remark = strings.TrimSpace(req.Remark)
	if req.Remark == "" {
		common.ApiError(c, errors.New("备注不能为空"))
		return
	}
	if utf8.RuneCountInString(req.Remark) > 512 {
		common.ApiError(c, errors.New("备注不能超过 512 个字符"))
		return
	}
	amountQuota, err := service.USDStringToQuota(req.Amount)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	switch req.Type {
	case model.CdkQuotaLogTypeAdminAdd, model.CdkQuotaLogTypeAdminRefund:
	case model.CdkQuotaLogTypeAdminDeduct:
		amountQuota = -amountQuota
	default:
		common.ApiError(c, errors.New("type 仅允许 admin_add/admin_deduct/admin_refund"))
		return
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		return model.AdjustEnterpriseCdkQuota(tx, req.UserId, c.GetInt("id"), req.Type, amountQuota, 0, 0, req.Remark)
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminGetEnterpriseCdkBalanceLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	logs, total, err := model.GetEnterpriseCdkQuotaLogs(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), c.Query("type"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetEnterpriseCdkBatches(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	creatorUserId, _ := strconv.Atoi(c.Query("user_id"))
	batches, total, err := model.GetAllEnterpriseCdkBatches(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), creatorUserId, c.Query("keyword"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(batches)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetEnterpriseCdkCodes(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	creatorUserId, _ := strconv.Atoi(c.Query("user_id"))
	batchId, _ := strconv.Atoi(c.Query("batch_id"))
	createdStart, _ := strconv.ParseInt(c.Query("created_start"), 10, 64)
	createdEnd, _ := strconv.ParseInt(c.Query("created_end"), 10, 64)
	rows, total, err := model.GetEnterpriseCdkRedemptions(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), creatorUserId, batchId, c.Query("status"), c.Query("keyword"), createdStart, createdEnd)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.CreateEnterpriseCdkOperationLog(&model.EnterpriseCdkOperationLog{
		OperatorId:     c.GetInt("id"),
		TargetUserId:   creatorUserId,
		Action:         model.EnterpriseCdkOperationViewAdmin,
		BatchId:        batchId,
		CdkCount:       len(rows),
		RequestSummary: fmt.Sprintf("page=%d page_size=%d user_id=%d batch_id=%d status=%s keyword=%s created_start=%d created_end=%d", pageInfo.GetPage(), pageInfo.GetPageSize(), creatorUserId, batchId, c.Query("status"), c.Query("keyword"), createdStart, createdEnd),
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rows)
	common.ApiSuccess(c, pageInfo)
}

func AdminDisableEnterpriseCdkCode(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req struct {
		Disabled *bool `json:"disabled" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	status := common.RedemptionCodeStatusEnabled
	if *req.Disabled {
		status = common.RedemptionCodeStatusDisabled
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		var code model.Redemption
		query := tx.Where("id = ? AND batch_id > 0 AND status IN ? AND used_user_id = 0 AND recycled_time = 0", id, []int{
			common.RedemptionCodeStatusEnabled,
			common.RedemptionCodeStatusDisabled,
		})
		if !common.UsingSQLite {
			query = query.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		if err := query.First(&code).Error; err != nil {
			return errors.New("CDK 不存在或状态不可操作")
		}
		result := tx.Model(&model.Redemption{}).
			Where("id = ? AND batch_id > 0 AND status IN ? AND used_user_id = 0 AND recycled_time = 0", id, []int{
				common.RedemptionCodeStatusEnabled,
				common.RedemptionCodeStatusDisabled,
			}).
			Update("status", status)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("CDK 不存在或状态不可操作")
		}
		return tx.Create(&model.EnterpriseCdkOperationLog{
			OperatorId:     c.GetInt("id"),
			TargetUserId:   code.UserId,
			Action:         model.EnterpriseCdkOperationToggleCdk,
			BatchId:        code.BatchId,
			CdkCount:       1,
			RequestSummary: fmt.Sprintf("id=%d disabled=%v", id, *req.Disabled),
		}).Error
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminRecycleEnterpriseCdkCodes(c *gin.Context) {
	var req struct {
		CdkIds []int  `json:"cdk_ids" binding:"required"`
		Remark string `json:"remark" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if strings.TrimSpace(req.Remark) == "" {
		common.ApiError(c, errors.New("备注不能为空"))
		return
	}
	if utf8.RuneCountInString(strings.TrimSpace(req.Remark)) > 512 {
		common.ApiError(c, errors.New("备注不能超过 512 个字符"))
		return
	}
	refundedCount, refundedQuota, err := model.RecycleEnterpriseCdkCodes(req.CdkIds, c.GetInt("id"), strings.TrimSpace(req.Remark))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"refunded_count": refundedCount,
		"refunded_quota": refundedQuota,
	})
}

func AdminGetEnterpriseCdkOperationLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	targetUserId, _ := strconv.Atoi(c.Query("user_id"))
	logs, total, err := model.GetEnterpriseCdkOperationLogs(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), targetUserId, c.Query("action"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}

func AdminEnterpriseCdkExport(c *gin.Context) {
	var req enterpriseCdkExportRequest
	if !bindEnterpriseCdkExportRequest(c, &req) {
		return
	}
	var rows []*model.EnterpriseCdkExportRow
	var err error
	if req.UserId > 0 || req.Status != "" || req.Keyword != "" || req.CreatedStart > 0 || req.CreatedEnd > 0 {
		rows, err = model.GetEnterpriseCdkRedemptionsForExport(req.UserId, req.BatchId, req.CdkIds, req.Status, req.Keyword, req.CreatedStart, req.CreatedEnd)
	} else {
		rows, err = model.GetRedemptionsForExport(0, req.BatchId, req.CdkIds, true)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.CreateEnterpriseCdkOperationLog(&model.EnterpriseCdkOperationLog{
		OperatorId:     c.GetInt("id"),
		TargetUserId:   req.UserId,
		Action:         model.EnterpriseCdkOperationExportAdmin,
		BatchId:        req.BatchId,
		CdkCount:       len(rows),
		RequestSummary: fmt.Sprintf("user_id=%d batch_id=%d status=%s keyword=%s created_start=%d created_end=%d ids=%v", req.UserId, req.BatchId, req.Status, req.Keyword, req.CreatedStart, req.CreatedEnd, req.CdkIds),
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	writeEnterpriseCdkCSV(c, rows, true)
}

func enterpriseCdkNamedPageQuery(c *gin.Context, pageParam string) *common.PageInfo {
	page, _ := strconv.Atoi(c.Query(pageParam))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	if pageSize <= 0 {
		pageSize = common.ItemsPerPage
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return &common.PageInfo{Page: page, PageSize: pageSize}
}

func AdminGetEnterpriseCdkUserDetail(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	policy, _ := model.GetEnterpriseCdkWhitelistPolicy(userId)
	quotaSummary, err := model.GetEnterpriseCdkQuotaSummary(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userSummary, err := model.GetEnterpriseCdkUserSummary(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	logsPage := enterpriseCdkNamedPageQuery(c, "logs_p")
	logs, logsTotal, err := model.GetEnterpriseCdkQuotaLogs(userId, logsPage.GetStartIdx(), logsPage.GetPageSize(), "")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	logsPage.SetTotal(int(logsTotal))
	logsPage.SetItems(logs)

	batchesPage := enterpriseCdkNamedPageQuery(c, "batches_p")
	batches, batchesTotal, err := model.GetEnterpriseCdkBatchesByUser(userId, batchesPage.GetStartIdx(), batchesPage.GetPageSize(), "")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	batchesPage.SetTotal(int(batchesTotal))
	batchesPage.SetItems(batches)

	common.ApiSuccess(c, gin.H{
		"user": gin.H{
			"id":                   user.Id,
			"email":                user.Email,
			"username":             user.Username,
			"enterprise_cdk_quota": user.EnterpriseCdkQuota,
			"balance":              service.QuotaToUSDString(user.EnterpriseCdkQuota),
		},
		"whitelist":        policy,
		"quota_summary":    quotaSummary,
		"customer_summary": userSummary,
		"logs":             logs,
		"logs_page":        logsPage,
		"batches":          batches,
		"batches_page":     batchesPage,
	})
}

func writeEnterpriseCdkCSV(c *gin.Context, rows []*model.EnterpriseCdkExportRow, includeCreator bool) {
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="enterprise-cdks.csv"`)
	_, _ = c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(c.Writer)
	header := []string{"批次名称", "CDK", "面额(USD)", "状态", "创建时间", "过期时间", "兑换时间", "兑换用户"}
	if includeCreator {
		header = []string{"创建人邮箱", "批次名称", "CDK", "面额(USD)", "状态", "创建时间", "过期时间", "兑换时间", "兑换用户"}
	}
	_ = writer.Write(header)
	for _, row := range rows {
		redeemer := row.UsedUserDisplay
		if redeemer == "" {
			redeemer = row.UsedUserEmail
		}
		if redeemer == "" && row.UsedUserId > 0 {
			redeemer = strconv.Itoa(row.UsedUserId)
		}
		record := []string{
			row.BatchName,
			row.Key,
			service.QuotaToUSDString(row.Quota),
			enterpriseCdkStatusText(row),
			formatEnterpriseCdkTime(row.CreatedTime),
			formatEnterpriseCdkTime(row.ExpiredTime),
			formatEnterpriseCdkTime(row.RedeemedTime),
			redeemer,
		}
		if includeCreator {
			record = append([]string{row.CreatorEmail}, record...)
		}
		_ = writer.Write(record)
	}
	writer.Flush()
}

func enterpriseCdkStatusText(row *model.EnterpriseCdkExportRow) string {
	if row.RecycledTime > 0 {
		return "已回收"
	}
	switch row.Status {
	case common.RedemptionCodeStatusUsed:
		return "已兑换"
	case common.RedemptionCodeStatusDisabled:
		return "已禁用"
	}
	if row.ExpiredTime != 0 && row.ExpiredTime < common.GetTimestamp() {
		return "已过期"
	}
	return "未兑换"
}

func formatEnterpriseCdkTime(ts int64) string {
	if ts == 0 {
		return ""
	}
	return time.Unix(ts, 0).Format("2006-01-02 15:04:05")
}

func checkedEnterpriseCdkTotalQuota(unitQuota int, count int) (int, error) {
	if unitQuota <= 0 || count <= 0 {
		return 0, errors.New("创建总面额必须大于 0")
	}
	maxInt := int(^uint(0) >> 1)
	if unitQuota > maxInt/count {
		return 0, errors.New("创建总面额过大")
	}
	return unitQuota * count, nil
}

func bindEnterpriseCdkExportRequest(c *gin.Context, req *enterpriseCdkExportRequest) bool {
	if c.Request == nil || c.Request.Body == nil || c.Request.ContentLength == 0 {
		return true
	}
	if err := c.ShouldBindJSON(req); err != nil {
		if errors.Is(err, io.EOF) {
			return true
		}
		common.ApiError(c, err)
		return false
	}
	return true
}
