package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCalculateUserPermissionsIncludesAffiliateRebateGrayAccess(t *testing.T) {
	cfg := operation_setting.GetAffiliateRebateSetting()
	original := *cfg
	t.Cleanup(func() { *cfg = original })

	cfg.Enabled = true
	cfg.GrayEnabled = true
	cfg.GrayUserIds = "7"

	allowed := calculateUserPermissions(common.RoleCommonUser, 7)
	require.Equal(t, true, allowed["affiliate_rebate"])

	blocked := calculateUserPermissions(common.RoleCommonUser, 8)
	require.Equal(t, false, blocked["affiliate_rebate"])
}

func TestTransferAffQuotaRejectsNonGrayWhitelistUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := operation_setting.GetAffiliateRebateSetting()
	original := *cfg
	t.Cleanup(func() { *cfg = original })

	cfg.Enabled = true
	cfg.GrayEnabled = true
	cfg.GrayUserIds = "7"

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/aff_transfer", bytes.NewReader([]byte(`{"quota":1}`)))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", 8)

	TransferAffQuota(ctx)

	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.Contains(t, recorder.Body.String(), "no permission")
}
