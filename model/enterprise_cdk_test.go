package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func resetEnterpriseCdkTables(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.Exec("DELETE FROM enterprise_cdk_operation_logs").Error)
	require.NoError(t, DB.Exec("DELETE FROM enterprise_cdk_quota_logs").Error)
	require.NoError(t, DB.Exec("DELETE FROM enterprise_cdk_batches").Error)
	require.NoError(t, DB.Exec("DELETE FROM enterprise_cdk_whitelists").Error)
	require.NoError(t, DB.Exec("DELETE FROM redemptions").Error)
	require.NoError(t, DB.Exec("DELETE FROM users").Error)
}

func seedEnterpriseCdkUser(t *testing.T, id int, username string, quota int) {
	t.Helper()
	user := &User{
		Id:                 id,
		PublicId:           "100000000" + string(rune('0'+id)),
		Username:           username,
		Password:           "hashed",
		DisplayName:        username,
		Email:              username + "@example.com",
		AffCode:            username + "_aff",
		Role:               common.RoleCommonUser,
		Status:             common.UserStatusEnabled,
		EnterpriseCdkQuota: quota,
	}
	require.NoError(t, DB.Create(user).Error)
}

func TestEnterpriseCdkQuotaAdjustmentWritesBeforeAfterBalances(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise", 1000)

	err := DB.Transaction(func(tx *gorm.DB) error {
		return AdjustEnterpriseCdkQuota(tx, 1, 99, CdkQuotaLogTypeAdminAdd, 500, 0, 0, "wechat received")
	})
	require.NoError(t, err)

	var user User
	require.NoError(t, DB.First(&user, 1).Error)
	require.Equal(t, 1500, user.EnterpriseCdkQuota)

	var log EnterpriseCdkQuotaLog
	require.NoError(t, DB.First(&log, "user_id = ?", 1).Error)
	require.Equal(t, CdkQuotaLogTypeAdminAdd, log.Type)
	require.Equal(t, 500, log.Amount)
	require.Equal(t, 1000, log.BalanceBefore)
	require.Equal(t, 1500, log.BalanceAfter)
	require.Equal(t, 99, log.OperatorId)
	require.Equal(t, "wechat received", log.Remark)
}

func TestEnterpriseCdkQuotaDeductionFailsWhenBalanceInsufficient(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise", 100)

	err := DB.Transaction(func(tx *gorm.DB) error {
		return AdjustEnterpriseCdkQuota(tx, 1, 0, CdkQuotaLogTypeCreateCdk, -200, 10, 2, "")
	})
	require.Error(t, err)

	var user User
	require.NoError(t, DB.First(&user, 1).Error)
	require.Equal(t, 100, user.EnterpriseCdkQuota)

	var count int64
	require.NoError(t, DB.Model(&EnterpriseCdkQuotaLog{}).Count(&count).Error)
	require.Equal(t, int64(0), count)
}

func TestEnterpriseCdkWhitelistDuplicateAddIsIdempotentAndDefaultsLimit(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise", 0)

	require.NoError(t, AddEnterpriseCdkWhitelist(1, 99))
	require.NoError(t, AddEnterpriseCdkWhitelist(1, 100))

	var count int64
	require.NoError(t, DB.Model(&EnterpriseCdkWhitelist{}).Where("user_id = ?", 1).Count(&count).Error)
	require.Equal(t, int64(1), count)

	policy, err := GetEnterpriseCdkWhitelistPolicy(1)
	require.NoError(t, err)
	require.Equal(t, 500, policy.MaxBatchCreateCount)
	require.Equal(t, 99, policy.OperatorId)
}

func TestRecycleEnterpriseCdkCodesCannotRefundTwice(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise", 0)
	batch := &EnterpriseCdkBatch{
		CreatorUserId: 1,
		Name:          "July batch",
		Quota:         100,
		Count:         1,
		TotalQuota:    100,
	}
	require.NoError(t, DB.Create(batch).Error)
	code := &Redemption{
		UserId:      1,
		BatchId:     batch.Id,
		Key:         "unused-cdk",
		Name:        batch.Name,
		Quota:       100,
		Status:      common.RedemptionCodeStatusEnabled,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(code).Error)

	refunded, amount, err := RecycleEnterpriseCdkCodes([]int{code.Id}, 99, "manual refund")
	require.NoError(t, err)
	require.Equal(t, 1, refunded)
	require.Equal(t, 100, amount)

	refunded, amount, err = RecycleEnterpriseCdkCodes([]int{code.Id}, 99, "manual refund again")
	require.NoError(t, err)
	require.Equal(t, 0, refunded)
	require.Equal(t, 0, amount)

	var user User
	require.NoError(t, DB.First(&user, 1).Error)
	require.Equal(t, 100, user.EnterpriseCdkQuota)
}

func TestRecycleEnterpriseCdkCodesDoesNotRefundExpiredCodes(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise", 0)
	batch := &EnterpriseCdkBatch{
		CreatorUserId: 1,
		Name:          "July batch",
		Quota:         100,
		Count:         1,
		TotalQuota:    100,
	}
	require.NoError(t, DB.Create(batch).Error)
	code := &Redemption{
		UserId:      1,
		BatchId:     batch.Id,
		Key:         "expired-cdk",
		Name:        batch.Name,
		Quota:       100,
		Status:      common.RedemptionCodeStatusEnabled,
		ExpiredTime: common.GetTimestamp() - 60,
	}
	require.NoError(t, DB.Create(code).Error)

	refunded, amount, err := RecycleEnterpriseCdkCodes([]int{code.Id}, 99, "manual refund")
	require.NoError(t, err)
	require.Equal(t, 0, refunded)
	require.Equal(t, 0, amount)

	var user User
	require.NoError(t, DB.First(&user, 1).Error)
	require.Equal(t, 0, user.EnterpriseCdkQuota)
}

func TestGetRedemptionsForExportFiltersByCreatorForNonAdminUsers(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise-a", 0)
	seedEnterpriseCdkUser(t, 2, "enterprise-b", 0)

	firstBatch := &EnterpriseCdkBatch{CreatorUserId: 1, Name: "A", Quota: 100, Count: 1, TotalQuota: 100}
	secondBatch := &EnterpriseCdkBatch{CreatorUserId: 2, Name: "B", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, DB.Create(firstBatch).Error)
	require.NoError(t, DB.Create(secondBatch).Error)
	require.NoError(t, DB.Create(&Redemption{UserId: 1, BatchId: firstBatch.Id, Key: "owned", Name: "A", Quota: 100, Status: common.RedemptionCodeStatusEnabled}).Error)
	require.NoError(t, DB.Create(&Redemption{UserId: 2, BatchId: secondBatch.Id, Key: "other", Name: "B", Quota: 100, Status: common.RedemptionCodeStatusEnabled}).Error)
	require.NoError(t, DB.Create(&Redemption{UserId: 1, BatchId: 0, Key: "ordinary", Name: "ordinary", Quota: 100, Status: common.RedemptionCodeStatusEnabled}).Error)

	rows, err := GetRedemptionsForExport(1, 0, nil, false)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "owned", rows[0].Key)

	adminRows, err := GetRedemptionsForExport(0, 0, nil, true)
	require.NoError(t, err)
	require.Len(t, adminRows, 2)
}

func TestEnterpriseCdkQueriesExcludeSoftDeletedRedemptions(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise-a", 0)
	batch := &EnterpriseCdkBatch{CreatorUserId: 1, Name: "A", Quota: 100, Count: 2, TotalQuota: 200}
	require.NoError(t, DB.Create(batch).Error)
	active := &Redemption{UserId: 1, BatchId: batch.Id, Key: "active-enterprise", Name: "A", Quota: 100, Status: common.RedemptionCodeStatusEnabled}
	deleted := &Redemption{UserId: 1, BatchId: batch.Id, Key: "deleted-enterprise", Name: "A", Quota: 100, Status: common.RedemptionCodeStatusEnabled}
	require.NoError(t, DB.Create(active).Error)
	require.NoError(t, DB.Create(deleted).Error)
	require.NoError(t, DB.Delete(deleted).Error)

	exportRows, err := GetRedemptionsForExport(1, batch.Id, nil, false)
	require.NoError(t, err)
	require.Len(t, exportRows, 1)
	require.Equal(t, active.Id, exportRows[0].Id)

	copyRows, err := GetUnusedEnterpriseCdkCodesForCopy(batch.Id)
	require.NoError(t, err)
	require.Len(t, copyRows, 1)
	require.Equal(t, active.Id, copyRows[0].Id)

	detailRows, detailTotal, err := GetRedemptionsByBatch(batch.Id, "", "", 0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(1), detailTotal)
	require.Len(t, detailRows, 1)
	require.Equal(t, active.Id, detailRows[0].Id)

	adminRows, adminTotal, err := GetEnterpriseCdkRedemptions(0, 20, 1, batch.Id, "", "")
	require.NoError(t, err)
	require.Equal(t, int64(1), adminTotal)
	require.Len(t, adminRows, 1)
	require.Equal(t, active.Id, adminRows[0].Id)
}

func TestOrdinaryRedemptionManagementExcludesEnterpriseCdks(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise-a", 0)
	batch := &EnterpriseCdkBatch{CreatorUserId: 1, Name: "A", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, DB.Create(batch).Error)
	ordinary := &Redemption{UserId: 1, BatchId: 0, Key: "ordinary", Name: "ordinary", Quota: 100, Status: common.RedemptionCodeStatusEnabled}
	enterprise := &Redemption{UserId: 1, BatchId: batch.Id, Key: "enterprise", Name: "enterprise", Quota: 100, Status: common.RedemptionCodeStatusEnabled}
	require.NoError(t, DB.Create(ordinary).Error)
	require.NoError(t, DB.Create(enterprise).Error)

	all, total, err := GetAllRedemptions(0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, all, 1)
	require.Equal(t, ordinary.Id, all[0].Id)

	search, searchTotal, err := SearchRedemptions("enterprise", 0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(0), searchTotal)
	require.Empty(t, search)

	_, err = GetRedemptionById(enterprise.Id)
	require.Error(t, err)

	enterprise.Name = "updated-enterprise"
	require.Error(t, enterprise.Update())

	require.Error(t, DeleteRedemptionById(enterprise.Id))
	var enterpriseCount int64
	require.NoError(t, DB.Model(&Redemption{}).Where("id = ?", enterprise.Id).Count(&enterpriseCount).Error)
	require.Equal(t, int64(1), enterpriseCount)
}

func TestRedeemRejectsRecycledEnterpriseCdk(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise-a", 0)
	seedEnterpriseCdkUser(t, 2, "redeemer", 0)
	batch := &EnterpriseCdkBatch{CreatorUserId: 1, Name: "A", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, DB.Create(batch).Error)
	code := &Redemption{
		UserId:               1,
		BatchId:              batch.Id,
		Key:                  "recycled-enterprise",
		Name:                 "enterprise",
		Quota:                100,
		Status:               common.RedemptionCodeStatusEnabled,
		RecycledTime:         common.GetTimestamp(),
		RecycleQuotaReturned: 100,
	}
	require.NoError(t, DB.Create(code).Error)

	quota, err := Redeem(code.Key, 2)
	require.ErrorIs(t, err, ErrRedeemFailed)
	require.Equal(t, 0, quota)

	var redeemer User
	require.NoError(t, DB.First(&redeemer, 2).Error)
	require.Equal(t, 0, redeemer.Quota)
}

func TestDeleteInvalidRedemptionsKeepsEnterpriseCdkHistory(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise-a", 0)
	batch := &EnterpriseCdkBatch{CreatorUserId: 1, Name: "A", Quota: 100, Count: 1, TotalQuota: 100}
	require.NoError(t, DB.Create(batch).Error)
	require.NoError(t, DB.Create(&Redemption{UserId: 1, BatchId: batch.Id, Key: "enterprise-used", Name: "A", Quota: 100, Status: common.RedemptionCodeStatusUsed}).Error)
	require.NoError(t, DB.Create(&Redemption{UserId: 1, BatchId: 0, Key: "ordinary-used", Name: "ordinary", Quota: 100, Status: common.RedemptionCodeStatusUsed}).Error)

	deleted, err := DeleteInvalidRedemptions()
	require.NoError(t, err)
	require.Equal(t, int64(1), deleted)

	var enterpriseCount int64
	require.NoError(t, DB.Model(&Redemption{}).Where("batch_id = ?", batch.Id).Count(&enterpriseCount).Error)
	require.Equal(t, int64(1), enterpriseCount)
}
