package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestUSDStringToQuotaRejectsIntOverflow(t *testing.T) {
	originalQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 1
	t.Cleanup(func() { common.QuotaPerUnit = originalQuotaPerUnit })

	quota, err := USDStringToQuota("9223372036854775808")

	require.Error(t, err)
	require.Equal(t, 0, quota)
}
