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

func TestListEnterpriseCdkWhitelistIncludesBalanceSummary(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise", 850)

	require.NoError(t, AddEnterpriseCdkWhitelist(1, 99))
	require.NoError(t, DB.Create(&EnterpriseCdkQuotaLog{
		UserId:      1,
		Type:        CdkQuotaLogTypeAdminAdd,
		Amount:      1000,
		CreatedTime: 100,
	}).Error)
	require.NoError(t, DB.Create(&EnterpriseCdkQuotaLog{
		UserId:      1,
		Type:        CdkQuotaLogTypeCreateCdk,
		Amount:      -250,
		CreatedTime: 200,
	}).Error)
	require.NoError(t, DB.Create(&EnterpriseCdkQuotaLog{
		UserId:      1,
		Type:        CdkQuotaLogTypeAdminRefund,
		Amount:      50,
		CreatedTime: 300,
	}).Error)
	require.NoError(t, DB.Create(&EnterpriseCdkQuotaLog{
		UserId:      1,
		Type:        CdkQuotaLogTypeAdminAdd,
		Amount:      500,
		CreatedTime: 400,
	}).Error)

	users, total, err := ListEnterpriseCdkWhitelist(0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, users, 1)
	require.Equal(t, 1500, users[0].TotalChargedQuota)
	require.Equal(t, 250, users[0].TotalConsumedQuota)
	require.Equal(t, int64(400), users[0].LastChargedTime)
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

func TestRecycleEnterpriseCdkCodesRefundsDisabledAndExpiredUnredeemedCodes(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise", 0)
	batch := &EnterpriseCdkBatch{
		CreatorUserId: 1,
		Name:          "July batch",
		Quota:         100,
		Count:         2,
		TotalQuota:    300,
	}
	require.NoError(t, DB.Create(batch).Error)
	expired := &Redemption{
		UserId:      1,
		BatchId:     batch.Id,
		Key:         "expired-cdk",
		Name:        batch.Name,
		Quota:       100,
		Status:      common.RedemptionCodeStatusEnabled,
		ExpiredTime: common.GetTimestamp() - 60,
	}
	disabled := &Redemption{
		UserId:  1,
		BatchId: batch.Id,
		Key:     "disabled-cdk",
		Name:    batch.Name,
		Quota:   200,
		Status:  common.RedemptionCodeStatusDisabled,
	}
	require.NoError(t, DB.Create(expired).Error)
	require.NoError(t, DB.Create(disabled).Error)

	refunded, amount, err := RecycleEnterpriseCdkCodes([]int{expired.Id, disabled.Id}, 99, "manual refund")
	require.NoError(t, err)
	require.Equal(t, 2, refunded)
	require.Equal(t, 300, amount)

	var user User
	require.NoError(t, DB.First(&user, 1).Error)
	require.Equal(t, 300, user.EnterpriseCdkQuota)
}

func TestRecycleEnterpriseCdkCodesWritesOperationLogsByUserAndBatch(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise-a", 0)
	seedEnterpriseCdkUser(t, 2, "enterprise-b", 0)
	firstBatch := &EnterpriseCdkBatch{CreatorUserId: 1, Name: "first", Quota: 100, Count: 1, TotalQuota: 100}
	secondBatch := &EnterpriseCdkBatch{CreatorUserId: 2, Name: "second", Quota: 200, Count: 1, TotalQuota: 200}
	require.NoError(t, DB.Create(firstBatch).Error)
	require.NoError(t, DB.Create(secondBatch).Error)
	firstCode := &Redemption{UserId: 1, BatchId: firstBatch.Id, Key: "recycle-log-a", Name: firstBatch.Name, Quota: 100, Status: common.RedemptionCodeStatusEnabled}
	secondCode := &Redemption{UserId: 2, BatchId: secondBatch.Id, Key: "recycle-log-b", Name: secondBatch.Name, Quota: 200, Status: common.RedemptionCodeStatusEnabled}
	require.NoError(t, DB.Create(firstCode).Error)
	require.NoError(t, DB.Create(secondCode).Error)

	refunded, amount, err := RecycleEnterpriseCdkCodes([]int{firstCode.Id, secondCode.Id}, 99, "manual refund")
	require.NoError(t, err)
	require.Equal(t, 2, refunded)
	require.Equal(t, 300, amount)

	var logs []EnterpriseCdkOperationLog
	require.NoError(t, DB.Where("action = ?", EnterpriseCdkOperationRecycleCdks).Order("target_user_id asc").Find(&logs).Error)
	require.Len(t, logs, 2)
	require.Equal(t, 1, logs[0].TargetUserId)
	require.Equal(t, firstBatch.Id, logs[0].BatchId)
	require.Equal(t, 1, logs[0].CdkCount)
	require.Equal(t, 2, logs[1].TargetUserId)
	require.Equal(t, secondBatch.Id, logs[1].BatchId)
	require.Equal(t, 1, logs[1].CdkCount)
}

func TestRecycleEnterpriseCdkCodesDoesNotRefundCodeChangedAfterSelection(t *testing.T) {
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
		Key:         "race-cdk",
		Name:        batch.Name,
		Quota:       100,
		Status:      common.RedemptionCodeStatusEnabled,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(code).Error)

	callbackName := "enterprise_cdk_mark_used_after_query"
	fired := false
	require.NoError(t, DB.Callback().Query().After("gorm:after_query").Register(callbackName, func(tx *gorm.DB) {
		if fired || tx.Statement.Schema == nil || tx.Statement.Schema.Table != "redemptions" {
			return
		}
		fired = true
		mutationTx := tx.Session(&gorm.Session{NewDB: true})
		require.NoError(t, mutationTx.Exec("UPDATE redemptions SET status = ?, used_user_id = ?, redeemed_time = ? WHERE id = ?", common.RedemptionCodeStatusUsed, 2, common.GetTimestamp(), code.Id).Error)
		var status int
		require.NoError(t, mutationTx.Raw("SELECT status FROM redemptions WHERE id = ?", code.Id).Scan(&status).Error)
		require.Equal(t, common.RedemptionCodeStatusUsed, status)
	}))
	t.Cleanup(func() {
		_ = DB.Callback().Query().Remove(callbackName)
	})

	refunded, amount, err := RecycleEnterpriseCdkCodes([]int{code.Id}, 99, "manual refund")
	require.NoError(t, err)
	require.True(t, fired)
	require.Equal(t, 0, refunded)
	require.Equal(t, 0, amount)

	var user User
	require.NoError(t, DB.First(&user, 1).Error)
	require.Equal(t, 0, user.EnterpriseCdkQuota)

	var updated Redemption
	require.NoError(t, DB.First(&updated, code.Id).Error)
	require.Equal(t, common.RedemptionCodeStatusUsed, updated.Status)
	require.Equal(t, 2, updated.UsedUserId)
	require.Equal(t, int64(0), updated.RecycledTime)
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

func TestEnterpriseCdkRedemptionRowsUseRedeemerDisplayFallback(t *testing.T) {
	resetEnterpriseCdkTables(t)
	require.NoError(t, DB.Create(&User{Id: 1, PublicId: "2000000001", Username: "enterprise", Password: "hashed", DisplayName: "Enterprise", Email: "enterprise@example.com", AffCode: "enterprise_aff", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}).Error)
	require.NoError(t, DB.Create(&User{Id: 2, PublicId: "2000000002", Username: "with-remark", Password: "hashed", DisplayName: "With Remark", Email: "remark@example.com", ProfileRemark: "张三 / 市场部", AffCode: "with_remark_aff", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}).Error)
	require.NoError(t, DB.Create(&User{Id: 3, PublicId: "2000000003", Username: "with-email", Password: "hashed", DisplayName: "With Email", Email: "email@example.com", AffCode: "with_email_aff", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}).Error)
	require.NoError(t, DB.Create(&User{Id: 4, PublicId: "2000000004", Username: "username-only", Password: "hashed", DisplayName: "Username Only", AffCode: "username_only_aff", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}).Error)

	batch := &EnterpriseCdkBatch{CreatorUserId: 1, Name: "A", Quota: 100, Count: 3, TotalQuota: 300}
	require.NoError(t, DB.Create(batch).Error)
	require.NoError(t, DB.Create(&Redemption{UserId: 1, BatchId: batch.Id, Key: "with-remark-code", Name: "A", Quota: 100, Status: common.RedemptionCodeStatusUsed, UsedUserId: 2}).Error)
	require.NoError(t, DB.Create(&Redemption{UserId: 1, BatchId: batch.Id, Key: "with-email-code", Name: "A", Quota: 100, Status: common.RedemptionCodeStatusUsed, UsedUserId: 3}).Error)
	require.NoError(t, DB.Create(&Redemption{UserId: 1, BatchId: batch.Id, Key: "username-only-code", Name: "A", Quota: 100, Status: common.RedemptionCodeStatusUsed, UsedUserId: 4}).Error)

	rows, err := GetRedemptionsForExport(1, batch.Id, nil, false)
	require.NoError(t, err)
	require.Len(t, rows, 3)

	displayByKey := make(map[string]string, len(rows))
	for _, row := range rows {
		displayByKey[row.Key] = row.UsedUserDisplay
	}
	require.Equal(t, "张三 / 市场部", displayByKey["with-remark-code"])
	require.Equal(t, "email@example.com", displayByKey["with-email-code"])
	require.Equal(t, "username-only", displayByKey["username-only-code"])
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

	adminRows, adminTotal, err := GetEnterpriseCdkRedemptions(0, 20, 1, batch.Id, "", "", 0, 0)
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

	search, searchTotal, err := SearchRedemptions("enterprise", "", 0, 20)
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

func TestDeleteInvalidRedemptionsRemovesLegacyNullBatchOrdinaryCodes(t *testing.T) {
	resetEnterpriseCdkTables(t)
	seedEnterpriseCdkUser(t, 1, "enterprise-a", 0)
	require.NoError(t, DB.Exec(
		"INSERT INTO redemptions (user_id, batch_id, `key`, status, name, quota, created_time) VALUES (?, NULL, ?, ?, ?, ?, ?)",
		1,
		"legacy-null-batch",
		common.RedemptionCodeStatusUsed,
		"legacy",
		100,
		common.GetTimestamp(),
	).Error)

	deleted, err := DeleteInvalidRedemptions()
	require.NoError(t, err)
	require.Equal(t, int64(1), deleted)

	var count int64
	require.NoError(t, DB.Unscoped().Model(&Redemption{}).Where("`key` = ?", "legacy-null-batch").Count(&count).Error)
	require.Equal(t, int64(1), count)
	require.NoError(t, DB.Model(&Redemption{}).Where("`key` = ?", "legacy-null-batch").Count(&count).Error)
	require.Equal(t, int64(0), count)
}
