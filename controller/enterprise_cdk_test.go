package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type enterpriseCdkAPIResponse struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func setupEnterpriseCdkControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false
	originalQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 100
	t.Cleanup(func() { common.QuotaPerUnit = originalQuotaPerUnit })

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Redemption{},
		&model.EnterpriseCdkWhitelist{},
		&model.EnterpriseCdkBatch{},
		&model.EnterpriseCdkQuotaLog{},
		&model.EnterpriseCdkOperationLog{},
	))
	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func seedEnterpriseCdkControllerUser(t *testing.T, id int, username string, quota int) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.User{
		Id:                 id,
		PublicId:           fmt.Sprintf("2%09d", id),
		Username:           username,
		Password:           "hashed",
		DisplayName:        username,
		Email:              username + "@example.com",
		AffCode:            username + "_aff",
		Role:               common.RoleCommonUser,
		Status:             common.UserStatusEnabled,
		EnterpriseCdkQuota: quota,
	}).Error)
}

func decodeEnterpriseCdkAPIResponse(t *testing.T, body []byte) enterpriseCdkAPIResponse {
	t.Helper()
	var response enterpriseCdkAPIResponse
	require.NoError(t, json.Unmarshal(body, &response))
	return response
}

func TestEnterpriseCdkBalanceRejectsNonWhitelistUserWithHTTP403(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 1000)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/enterprise/cdk/balance", nil, 1)
	EnterpriseCdkBalance(ctx)

	require.Equal(t, http.StatusForbidden, recorder.Code)
	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)
}

func TestEnterpriseCdkPermissionReturnsCreateLimit(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 1000)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))
	require.NoError(t, model.UpdateEnterpriseCdkWhitelistLimit(1, 7))

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/enterprise/cdk/permission", nil, 1)
	EnterpriseCdkPermission(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		HasPermission       bool `json:"has_permission"`
		MaxBatchCreateCount int  `json:"max_batch_create_count"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.True(t, payload.HasPermission)
	require.Equal(t, 7, payload.MaxBatchCreateCount)
}

func TestEnterpriseCdkContactMessageIsExposedInStatus(t *testing.T) {
	originalMap := common.OptionMap
	common.OptionMap = map[string]string{
		"EnterpriseCdkContactMessage": "请微信联系企业专员充值",
	}
	t.Cleanup(func() { common.OptionMap = originalMap })

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/status", nil, 0)
	GetStatus(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		EnterpriseCdkContactMessage string `json:"enterprise_cdk_contact_message"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.Equal(t, "请微信联系企业专员充值", payload.EnterpriseCdkContactMessage)
}

func TestEnterpriseCdkBalanceReturnsGlobalQuotaTotals(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 1000)
	seedEnterpriseCdkControllerUser(t, 2, "redeemer", 0)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))
	firstBatch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "first", Quota: 100, Count: 2, TotalQuota: 200}
	secondBatch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "second", Quota: 300, Count: 1, TotalQuota: 300}
	require.NoError(t, model.DB.Create(firstBatch).Error)
	require.NoError(t, model.DB.Create(secondBatch).Error)
	require.NoError(t, model.DB.Create(&model.Redemption{UserId: 1, BatchId: firstBatch.Id, Key: "used-cdk", Name: "first", Quota: 100, Status: common.RedemptionCodeStatusUsed, UsedUserId: 2}).Error)
	require.NoError(t, model.DB.Create(&model.Redemption{UserId: 1, BatchId: firstBatch.Id, Key: "unused-cdk", Name: "first", Quota: 100, Status: common.RedemptionCodeStatusEnabled}).Error)
	require.NoError(t, model.DB.Create(&model.Redemption{UserId: 1, BatchId: secondBatch.Id, Key: "disabled-cdk", Name: "second", Quota: 300, Status: common.RedemptionCodeStatusDisabled}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/enterprise/cdk/balance", nil, 1)
	EnterpriseCdkBalance(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		CreatedQuota int `json:"created_quota"`
		UsedQuota    int `json:"used_quota"`
		UnusedQuota  int `json:"unused_quota"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.Equal(t, 500, payload.CreatedQuota)
	require.Equal(t, 100, payload.UsedQuota)
	require.Equal(t, 100, payload.UnusedQuota)
}

func TestEnterpriseCdkCreateBatchDeductsBalanceAndCreatesCodes(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 1000)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/enterprise/cdk/batches", gin.H{
		"name":         "July batch",
		"remark":       "for customer A",
		"quota":        "2.00",
		"count":        3,
		"expired_time": int64(0),
	}, 1)
	CreateEnterpriseCdkBatch(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)

	var user model.User
	require.NoError(t, model.DB.First(&user, 1).Error)
	require.Equal(t, 400, user.EnterpriseCdkQuota)

	var batchCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseCdkBatch{}).Count(&batchCount).Error)
	require.Equal(t, int64(1), batchCount)

	var codeCount int64
	require.NoError(t, model.DB.Model(&model.Redemption{}).Where("user_id = ? AND batch_id > 0", 1).Count(&codeCount).Error)
	require.Equal(t, int64(3), codeCount)
}

func TestEnterpriseCdkCreateBatchInsufficientBalanceRollsBack(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 100)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/enterprise/cdk/batches", gin.H{
		"name":  "too expensive",
		"quota": "1.00",
		"count": 2,
	}, 1)
	CreateEnterpriseCdkBatch(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)

	var user model.User
	require.NoError(t, model.DB.First(&user, 1).Error)
	require.Equal(t, 100, user.EnterpriseCdkQuota)

	var batchCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseCdkBatch{}).Count(&batchCount).Error)
	require.Equal(t, int64(0), batchCount)
	var codeCount int64
	require.NoError(t, model.DB.Model(&model.Redemption{}).Count(&codeCount).Error)
	require.Equal(t, int64(0), codeCount)
}

func TestEnterpriseCdkBatchDetailRejectsOtherUsersBatch(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise-a", 1000)
	seedEnterpriseCdkControllerUser(t, 2, "enterprise-b", 1000)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))
	require.NoError(t, model.AddEnterpriseCdkWhitelist(2, 99))
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 2, Name: "private", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, model.DB.Create(batch).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, fmt.Sprintf("/api/enterprise/cdk/batches/%d", batch.Id), nil, 1)
	ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", batch.Id)}}
	EnterpriseCdkBatchDetail(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)
}

func TestAdminAdjustEnterpriseCdkBalanceRequiresRemark(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 100)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/admin/enterprise/balance/adjust", gin.H{
		"user_id": 1,
		"amount":  "10.00",
		"type":    model.CdkQuotaLogTypeAdminAdd,
		"remark":  "",
	}, 99)
	AdminAdjustEnterpriseCdkBalance(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)
	var user model.User
	require.NoError(t, model.DB.First(&user, 1).Error)
	require.Equal(t, 100, user.EnterpriseCdkQuota)
}

func TestAdminRecycleEnterpriseCdkCodesRefundsOnlyEligibleCodes(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 2, TotalQuota: 200}
	require.NoError(t, model.DB.Create(batch).Error)
	eligible := &model.Redemption{UserId: 1, BatchId: batch.Id, Key: "eligible", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusEnabled}
	used := &model.Redemption{UserId: 1, BatchId: batch.Id, Key: "used", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusUsed, UsedUserId: 2}
	require.NoError(t, model.DB.Create(eligible).Error)
	require.NoError(t, model.DB.Create(used).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/admin/enterprise/codes/recycle", gin.H{
		"cdk_ids": []int{eligible.Id, used.Id},
		"remark":  "manual recycle",
	}, 99)
	AdminRecycleEnterpriseCdkCodes(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		RefundedCount int `json:"refunded_count"`
		RefundedQuota int `json:"refunded_quota"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.Equal(t, 1, payload.RefundedCount)
	require.Equal(t, 100, payload.RefundedQuota)

	var user model.User
	require.NoError(t, model.DB.First(&user, 1).Error)
	require.Equal(t, 100, user.EnterpriseCdkQuota)
}

func TestAdminDisableEnterpriseCdkCodeRejectsUsedCode(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, model.DB.Create(batch).Error)
	used := &model.Redemption{UserId: 1, BatchId: batch.Id, Key: "used", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusUsed, UsedUserId: 2}
	require.NoError(t, model.DB.Create(used).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, fmt.Sprintf("/api/admin/enterprise/codes/%d/disable", used.Id), gin.H{
		"disabled": false,
	}, 99)
	ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", used.Id)}}
	AdminDisableEnterpriseCdkCode(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)

	var code model.Redemption
	require.NoError(t, model.DB.First(&code, used.Id).Error)
	require.Equal(t, common.RedemptionCodeStatusUsed, code.Status)
	require.Equal(t, 2, code.UsedUserId)
}

func TestAdminEnterpriseCdkUserDetailReturnsPaginatedLogsAndBatches(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 1000)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))
	for i := 0; i < 25; i++ {
		require.NoError(t, model.DB.Create(&model.EnterpriseCdkBatch{
			CreatorUserId: 1,
			Name:          fmt.Sprintf("batch-%02d", i),
			Quota:         100,
			Count:         1,
			TotalQuota:    100,
		}).Error)
		require.NoError(t, model.DB.Create(&model.EnterpriseCdkQuotaLog{
			UserId:        1,
			OperatorId:    99,
			Type:          model.CdkQuotaLogTypeAdminAdd,
			Amount:        100,
			BalanceBefore: i * 100,
			BalanceAfter:  (i + 1) * 100,
		}).Error)
	}

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/admin/enterprise/users/1?logs_p=2&batches_p=3&page_size=10", nil, 99)
	ctx.Params = gin.Params{{Key: "user_id", Value: "1"}}
	AdminGetEnterpriseCdkUserDetail(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		LogsPage struct {
			Page  int             `json:"page"`
			Total int             `json:"total"`
			Items json.RawMessage `json:"items"`
		} `json:"logs_page"`
		BatchesPage struct {
			Page  int             `json:"page"`
			Total int             `json:"total"`
			Items json.RawMessage `json:"items"`
		} `json:"batches_page"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.Equal(t, 2, payload.LogsPage.Page)
	require.Equal(t, 25, payload.LogsPage.Total)
	require.Equal(t, 3, payload.BatchesPage.Page)
	require.Equal(t, 25, payload.BatchesPage.Total)
	var logs []model.EnterpriseCdkQuotaLogRow
	var batches []model.EnterpriseCdkBatchRow
	require.NoError(t, json.Unmarshal(payload.LogsPage.Items, &logs))
	require.NoError(t, json.Unmarshal(payload.BatchesPage.Items, &batches))
	require.Len(t, logs, 10)
	require.Len(t, batches, 5)
}

func TestAdminGetEnterpriseCdkCodesWritesViewOperationLog(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, model.DB.Create(batch).Error)
	require.NoError(t, model.DB.Create(&model.Redemption{UserId: 1, BatchId: batch.Id, Key: "view-code", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusEnabled}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, fmt.Sprintf("/api/admin/enterprise/codes?user_id=1&batch_id=%d&status=unused&keyword=view&p=1&page_size=10", batch.Id), nil, 99)
	AdminGetEnterpriseCdkCodes(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)

	var log model.EnterpriseCdkOperationLog
	require.NoError(t, model.DB.First(&log, "action = ?", "view_admin").Error)
	require.Equal(t, 99, log.OperatorId)
	require.Equal(t, 1, log.TargetUserId)
	require.Equal(t, batch.Id, log.BatchId)
	require.Equal(t, 1, log.CdkCount)
	require.Contains(t, log.RequestSummary, "status=unused")
	require.Contains(t, log.RequestSummary, "keyword=view")
}

func TestEnterpriseCdkExportWritesCSVWithBOMAndOperationLog(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, model.DB.Create(batch).Error)
	require.NoError(t, model.DB.Create(&model.Redemption{UserId: 1, BatchId: batch.Id, Key: "export-me", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusEnabled}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/enterprise/cdk/export", gin.H{
		"batch_id": batch.Id,
	}, 1)
	EnterpriseCdkExport(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	body := recorder.Body.Bytes()
	require.GreaterOrEqual(t, len(body), 3)
	require.Equal(t, []byte{0xEF, 0xBB, 0xBF}, body[:3])
	require.Contains(t, string(body), "export-me")

	var logCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseCdkOperationLog{}).Where("action = ?", model.EnterpriseCdkOperationExportUser).Count(&logCount).Error)
	require.Equal(t, int64(1), logCount)
}

func TestEnterpriseCdkCopyUnusedReturnsAllUnusedCodes(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 105, TotalQuota: 10500}
	require.NoError(t, model.DB.Create(batch).Error)
	for i := 0; i < 105; i++ {
		require.NoError(t, model.DB.Create(&model.Redemption{
			UserId: 1, BatchId: batch.Id, Key: fmt.Sprintf("unused-%03d", i), Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusEnabled,
		}).Error)
	}

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/enterprise/cdk/copy-unused-log", gin.H{
		"batch_id": batch.Id,
	}, 1)
	EnterpriseCdkCopyUnusedLog(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		Codes []string `json:"codes"`
		Count int      `json:"count"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.Equal(t, 105, payload.Count)
	require.Len(t, payload.Codes, 105)

	var log model.EnterpriseCdkOperationLog
	require.NoError(t, model.DB.First(&log, "action = ?", model.EnterpriseCdkOperationCopyUnused).Error)
	require.Equal(t, 105, log.CdkCount)
}
