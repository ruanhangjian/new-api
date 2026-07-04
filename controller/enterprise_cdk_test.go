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
