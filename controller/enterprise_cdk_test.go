package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
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

func TestUpdateSelfSavesAndReturnsProfileRemark(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/user/self", gin.H{
		"profile_remark": "  张三 / 市场部  ",
	}, 1)
	UpdateSelf(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)

	var user model.User
	require.NoError(t, model.DB.First(&user, 1).Error)
	require.Equal(t, "张三 / 市场部", user.ProfileRemark)

	ctx, recorder = newAuthenticatedContext(t, http.MethodGet, "/api/user/self", nil, 1)
	ctx.Set("role", common.RoleCommonUser)
	GetSelf(ctx)

	response = decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		ProfileRemark string `json:"profile_remark"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.Equal(t, "张三 / 市场部", payload.ProfileRemark)
}

func TestUpdateSelfClearsProfileRemark(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id:            1,
		PublicId:      "2000000001",
		Username:      "enterprise",
		Password:      "hashed",
		DisplayName:   "enterprise",
		Email:         "enterprise@example.com",
		AffCode:       "enterprise_aff",
		Role:          common.RoleCommonUser,
		Status:        common.UserStatusEnabled,
		ProfileRemark: "旧备注",
	}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/user/self", gin.H{
		"profile_remark": "   ",
	}, 1)
	UpdateSelf(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)

	var user model.User
	require.NoError(t, model.DB.First(&user, 1).Error)
	require.Equal(t, "", user.ProfileRemark)
}

func newEnterpriseCdkRawJSONContext(t *testing.T, method string, target string, rawBody string, userID int) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(method, target, strings.NewReader(rawBody))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", userID)
	return ctx, recorder
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

func TestEnterpriseCdkUserEndpointsRejectNonWhitelistUsers(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 1000)

	tests := []struct {
		name   string
		method string
		target string
		body   gin.H
		run    func(*gin.Context)
	}{
		{
			name:   "batch list",
			method: http.MethodGet,
			target: "/api/enterprise/cdk/batches",
			run:    EnterpriseCdkBatches,
		},
		{
			name:   "create batch",
			method: http.MethodPost,
			target: "/api/enterprise/cdk/batches",
			body: gin.H{
				"name":  "blocked",
				"quota": "1.00",
				"count": 1,
			},
			run: CreateEnterpriseCdkBatch,
		},
		{
			name:   "export",
			method: http.MethodPost,
			target: "/api/enterprise/cdk/export",
			body: gin.H{
				"batch_id": 1,
			},
			run: EnterpriseCdkExport,
		},
		{
			name:   "copy unused",
			method: http.MethodPost,
			target: "/api/enterprise/cdk/copy-unused-log",
			body: gin.H{
				"batch_id": 1,
			},
			run: EnterpriseCdkCopyUnusedLog,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx, recorder := newAuthenticatedContext(t, test.method, test.target, test.body, 1)
			test.run(ctx)

			require.Equal(t, http.StatusForbidden, recorder.Code)
			response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
			require.False(t, response.Success)
		})
	}

	var batchCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseCdkBatch{}).Count(&batchCount).Error)
	require.Equal(t, int64(0), batchCount)
	var codeCount int64
	require.NoError(t, model.DB.Model(&model.Redemption{}).Count(&codeCount).Error)
	require.Equal(t, int64(0), codeCount)
	var operationLogCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseCdkOperationLog{}).Count(&operationLogCount).Error)
	require.Equal(t, int64(0), operationLogCount)
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

func TestEnterpriseCdkBalanceLogsFiltersByType(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 1000)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))
	require.NoError(t, model.DB.Create(&model.EnterpriseCdkQuotaLog{
		UserId:        1,
		OperatorId:    99,
		Type:          model.CdkQuotaLogTypeAdminAdd,
		Amount:        500,
		BalanceBefore: 1000,
		BalanceAfter:  1500,
		Remark:        "wechat received",
	}).Error)
	require.NoError(t, model.DB.Create(&model.EnterpriseCdkQuotaLog{
		UserId:          1,
		Type:            model.CdkQuotaLogTypeCreateCdk,
		Amount:          -200,
		BalanceBefore:   1500,
		BalanceAfter:    1300,
		RelatedBatchId:  10,
		RelatedCdkCount: 2,
	}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/enterprise/cdk/balance/logs?type=admin_add&p=1&page_size=20", nil, 1)
	EnterpriseCdkBalanceLogs(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		Total int                           `json:"total"`
		Items []model.EnterpriseCdkQuotaLog `json:"items"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.Equal(t, 1, payload.Total)
	require.Len(t, payload.Items, 1)
	require.Equal(t, model.CdkQuotaLogTypeAdminAdd, payload.Items[0].Type)
}

func TestEnterpriseCdkBatchesFiltersByKeyword(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise-a", 1000)
	seedEnterpriseCdkControllerUser(t, 2, "enterprise-b", 1000)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))
	require.NoError(t, model.AddEnterpriseCdkWhitelist(2, 99))
	require.NoError(t, model.DB.Create(&model.EnterpriseCdkBatch{
		CreatorUserId: 1,
		Name:          "Alpha Renewal",
		Quota:         100,
		Count:         1,
		TotalQuota:    100,
	}).Error)
	require.NoError(t, model.DB.Create(&model.EnterpriseCdkBatch{
		CreatorUserId: 1,
		Name:          "Beta Pilot",
		Quota:         100,
		Count:         1,
		TotalQuota:    100,
	}).Error)
	require.NoError(t, model.DB.Create(&model.EnterpriseCdkBatch{
		CreatorUserId: 2,
		Name:          "Alpha Other Owner",
		Quota:         100,
		Count:         1,
		TotalQuota:    100,
	}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/enterprise/cdk/batches?keyword=Alpha&p=1&page_size=20", nil, 1)
	EnterpriseCdkBatches(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		Total int                           `json:"total"`
		Items []model.EnterpriseCdkBatchRow `json:"items"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.Equal(t, 1, payload.Total)
	require.Len(t, payload.Items, 1)
	require.Equal(t, "Alpha Renewal", payload.Items[0].Name)
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

func TestEnterpriseCdkCreateBatchRejectsOverflowedQuota(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	common.QuotaPerUnit = 1
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/enterprise/cdk/batches", gin.H{
		"name":  "overflow",
		"quota": "9223372036854775809",
		"count": 1,
	}, 1)
	CreateEnterpriseCdkBatch(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)

	var user model.User
	require.NoError(t, model.DB.First(&user, 1).Error)
	require.Equal(t, 0, user.EnterpriseCdkQuota)

	var batchCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseCdkBatch{}).Count(&batchCount).Error)
	require.Equal(t, int64(0), batchCount)
	var codeCount int64
	require.NoError(t, model.DB.Model(&model.Redemption{}).Count(&codeCount).Error)
	require.Equal(t, int64(0), codeCount)
}

func TestEnterpriseCdkCreateBatchRejectsCountAboveHardLimit(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 2_000_000)
	require.NoError(t, model.DB.Create(&model.EnterpriseCdkWhitelist{
		UserId:              1,
		OperatorId:          99,
		MaxBatchCreateCount: 10001,
	}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/enterprise/cdk/batches", gin.H{
		"name":  "too many",
		"quota": "1.00",
		"count": 10001,
	}, 1)
	CreateEnterpriseCdkBatch(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)
	require.Contains(t, response.Message, "单次创建数量不能超过")

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

func TestAdminDisableEnterpriseCdkCodeRejectsMalformedJSON(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, model.DB.Create(batch).Error)
	code := &model.Redemption{UserId: 1, BatchId: batch.Id, Key: "toggle-malformed", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusDisabled}
	require.NoError(t, model.DB.Create(code).Error)

	ctx, recorder := newEnterpriseCdkRawJSONContext(t, http.MethodPut, fmt.Sprintf("/api/admin/enterprise/codes/%d/disable", code.Id), "{", 99)
	ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", code.Id)}}
	AdminDisableEnterpriseCdkCode(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)

	var updated model.Redemption
	require.NoError(t, model.DB.First(&updated, code.Id).Error)
	require.Equal(t, common.RedemptionCodeStatusDisabled, updated.Status)
}

func TestAdminDisableEnterpriseCdkCodeRequiresDisabledField(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, model.DB.Create(batch).Error)
	code := &model.Redemption{UserId: 1, BatchId: batch.Id, Key: "toggle-missing", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusDisabled}
	require.NoError(t, model.DB.Create(code).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, fmt.Sprintf("/api/admin/enterprise/codes/%d/disable", code.Id), gin.H{}, 99)
	ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", code.Id)}}
	AdminDisableEnterpriseCdkCode(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)

	var updated model.Redemption
	require.NoError(t, model.DB.First(&updated, code.Id).Error)
	require.Equal(t, common.RedemptionCodeStatusDisabled, updated.Status)
}

func TestAdminUpdateEnterpriseCdkWhitelistLimitRejectsCountAboveHardLimit(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/admin/enterprise/whitelist/1/limit", gin.H{
		"max_batch_create_count": 10001,
	}, 99)
	ctx.Params = gin.Params{{Key: "user_id", Value: "1"}}
	AdminUpdateEnterpriseCdkWhitelistLimit(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)
	require.Contains(t, response.Message, "单次创建数量不能超过")

	policy, err := model.GetEnterpriseCdkWhitelistPolicy(1)
	require.NoError(t, err)
	require.Equal(t, model.DefaultEnterpriseCdkMaxBatchCreateCount, policy.MaxBatchCreateCount)
}

func TestAdminDisableEnterpriseCdkCodeWritesStructuredOperationLog(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, model.DB.Create(batch).Error)
	code := &model.Redemption{UserId: 1, BatchId: batch.Id, Key: "toggle-log", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusEnabled}
	require.NoError(t, model.DB.Create(code).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, fmt.Sprintf("/api/admin/enterprise/codes/%d/disable", code.Id), gin.H{
		"disabled": true,
	}, 99)
	ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", code.Id)}}
	AdminDisableEnterpriseCdkCode(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)

	var log model.EnterpriseCdkOperationLog
	require.NoError(t, model.DB.First(&log, "action = ?", model.EnterpriseCdkOperationToggleCdk).Error)
	require.Equal(t, 99, log.OperatorId)
	require.Equal(t, 1, log.TargetUserId)
	require.Equal(t, batch.Id, log.BatchId)
	require.Equal(t, 1, log.CdkCount)
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

func TestAdminEnterpriseCdkCodesFiltersByCreatedTime(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 3, TotalQuota: 300}
	require.NoError(t, model.DB.Create(batch).Error)
	for _, item := range []struct {
		key         string
		createdTime int64
	}{
		{"too-early", 1000},
		{"in-range", 2000},
		{"too-late", 3000},
	} {
		require.NoError(t, model.DB.Create(&model.Redemption{
			UserId:      1,
			BatchId:     batch.Id,
			Key:         item.key,
			Name:        "batch",
			Quota:       100,
			Status:      common.RedemptionCodeStatusEnabled,
			CreatedTime: item.createdTime,
		}).Error)
	}

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/admin/enterprise/codes?created_start=1500&created_end=2500&p=1&page_size=10", nil, 99)
	AdminGetEnterpriseCdkCodes(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.True(t, response.Success, response.Message)
	var payload struct {
		Total int             `json:"total"`
		Items json.RawMessage `json:"items"`
	}
	require.NoError(t, json.Unmarshal(response.Data, &payload))
	require.Equal(t, 1, payload.Total)
	var rows []model.EnterpriseCdkExportRow
	require.NoError(t, json.Unmarshal(payload.Items, &rows))
	require.Len(t, rows, 1)
	require.Equal(t, "in-range", rows[0].Key)
}

func TestAdminEnterpriseCdkExportFiltersByCreatedTime(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 2, TotalQuota: 200}
	require.NoError(t, model.DB.Create(batch).Error)
	require.NoError(t, model.DB.Create(&model.Redemption{UserId: 1, BatchId: batch.Id, Key: "too-early", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusEnabled, CreatedTime: 1000}).Error)
	require.NoError(t, model.DB.Create(&model.Redemption{UserId: 1, BatchId: batch.Id, Key: "in-range", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusEnabled, CreatedTime: 2000}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/admin/enterprise/export", gin.H{
		"user_id":       1,
		"created_start": int64(1500),
		"created_end":   int64(2500),
	}, 99)
	AdminEnterpriseCdkExport(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	body := string(recorder.Body.Bytes())
	require.Contains(t, body, "in-range")
	require.NotContains(t, body, "too-early")
}

func TestAdminEnterpriseCdkExportCombinesIdsAndFilters(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise-a", 0)
	seedEnterpriseCdkControllerUser(t, 2, "enterprise-b", 0)
	firstBatch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch-a", Quota: 100, Count: 2, TotalQuota: 200}
	secondBatch := &model.EnterpriseCdkBatch{CreatorUserId: 2, Name: "batch-b", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, model.DB.Create(firstBatch).Error)
	require.NoError(t, model.DB.Create(secondBatch).Error)
	ownedIncluded := &model.Redemption{UserId: 1, BatchId: firstBatch.Id, Key: "owned-included", Name: "batch-a", Quota: 100, Status: common.RedemptionCodeStatusEnabled, CreatedTime: 2000}
	ownedNotSelected := &model.Redemption{UserId: 1, BatchId: firstBatch.Id, Key: "owned-not-selected", Name: "batch-a", Quota: 100, Status: common.RedemptionCodeStatusEnabled, CreatedTime: 2000}
	otherSelected := &model.Redemption{UserId: 2, BatchId: secondBatch.Id, Key: "other-selected", Name: "batch-b", Quota: 100, Status: common.RedemptionCodeStatusEnabled, CreatedTime: 2000}
	require.NoError(t, model.DB.Create(ownedIncluded).Error)
	require.NoError(t, model.DB.Create(ownedNotSelected).Error)
	require.NoError(t, model.DB.Create(otherSelected).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/admin/enterprise/export", gin.H{
		"user_id":       1,
		"status":        "unused",
		"created_start": int64(1500),
		"created_end":   int64(2500),
		"cdk_ids":       []int{ownedIncluded.Id, otherSelected.Id},
	}, 99)
	AdminEnterpriseCdkExport(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	body := string(recorder.Body.Bytes())
	require.Contains(t, body, "owned-included")
	require.NotContains(t, body, "owned-not-selected")
	require.NotContains(t, body, "other-selected")
}

func TestAdminEnterpriseCdkExportRejectsMalformedJSON(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)

	ctx, recorder := newEnterpriseCdkRawJSONContext(t, http.MethodPost, "/api/admin/enterprise/export", "{", 99)
	AdminEnterpriseCdkExport(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)
}

func TestEnterpriseCdkExportWritesCSVWithBOMAndOperationLog(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	seedEnterpriseCdkControllerUser(t, 2, "redeemer", 0)
	require.NoError(t, model.UpdateUserProfileRemark(2, "张三 / 市场部"))
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))
	batch := &model.EnterpriseCdkBatch{CreatorUserId: 1, Name: "batch", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, model.DB.Create(batch).Error)
	require.NoError(t, model.DB.Create(&model.Redemption{UserId: 1, BatchId: batch.Id, Key: "export-me", Name: "batch", Quota: 100, Status: common.RedemptionCodeStatusUsed, UsedUserId: 2}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/enterprise/cdk/export", gin.H{
		"batch_id": batch.Id,
	}, 1)
	EnterpriseCdkExport(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	body := recorder.Body.Bytes()
	require.GreaterOrEqual(t, len(body), 3)
	require.Equal(t, []byte{0xEF, 0xBB, 0xBF}, body[:3])
	require.Contains(t, string(body), "export-me")
	require.Contains(t, string(body), "兑换用户")
	require.Contains(t, string(body), "张三 / 市场部")

	var logCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseCdkOperationLog{}).Where("action = ?", model.EnterpriseCdkOperationExportUser).Count(&logCount).Error)
	require.Equal(t, int64(1), logCount)
}

func TestEnterpriseCdkExportRejectsMalformedJSON(t *testing.T) {
	setupEnterpriseCdkControllerTestDB(t)
	seedEnterpriseCdkControllerUser(t, 1, "enterprise", 0)
	require.NoError(t, model.AddEnterpriseCdkWhitelist(1, 99))

	ctx, recorder := newEnterpriseCdkRawJSONContext(t, http.MethodPost, "/api/enterprise/cdk/export", "{", 1)
	EnterpriseCdkExport(ctx)

	response := decodeEnterpriseCdkAPIResponse(t, recorder.Body.Bytes())
	require.False(t, response.Success)

	var logCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseCdkOperationLog{}).Count(&logCount).Error)
	require.Equal(t, int64(0), logCount)
}

func TestEnterpriseCdkStatusTextReportsRecycled(t *testing.T) {
	row := &model.EnterpriseCdkExportRow{
		Status:       common.RedemptionCodeStatusDisabled,
		RecycledTime: common.GetTimestamp(),
	}

	require.Equal(t, "已回收", enterpriseCdkStatusText(row))
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
