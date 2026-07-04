package service

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/shopspring/decimal"
)

func IsEnterpriseCdkUser(userId int) bool {
	return model.IsEnterpriseCdkWhitelisted(userId)
}

func GetEnterpriseCdkWhitelistPolicy(userId int) (*model.EnterpriseCdkWhitelist, error) {
	return model.GetEnterpriseCdkWhitelistPolicy(userId)
}

func ListEnterpriseCdkWhitelist(startIdx, pageSize int) ([]*model.EnterpriseCdkWhitelistUser, int64, error) {
	return model.ListEnterpriseCdkWhitelist(startIdx, pageSize)
}

func AddEnterpriseCdkWhitelist(userId, operatorId int) error {
	return model.AddEnterpriseCdkWhitelist(userId, operatorId)
}

func RemoveEnterpriseCdkWhitelist(userId int) error {
	return model.RemoveEnterpriseCdkWhitelist(userId)
}

func USDStringToQuota(raw string) (int, error) {
	amount, err := decimal.NewFromString(strings.TrimSpace(raw))
	if err != nil || !amount.GreaterThan(decimal.Zero) {
		return 0, errors.New("金额必须大于 0")
	}
	quota := amount.Mul(quotaPerUnitDecimal())
	if !quota.Equal(quota.Truncate(0)) {
		return 0, errors.New("金额精度过高")
	}
	if quota.GreaterThan(decimal.NewFromInt(int64(maxIntValue()))) {
		return 0, errors.New("金额过大")
	}
	return int(quota.IntPart()), nil
}

func QuotaToUSDString(quota int) string {
	return decimal.NewFromInt(int64(quota)).
		Div(quotaPerUnitDecimal()).
		StringFixed(2)
}

func quotaPerUnitDecimal() decimal.Decimal {
	value := strconv.FormatFloat(common.QuotaPerUnit, 'f', -1, 64)
	quotaPerUnit, err := decimal.NewFromString(value)
	if err != nil || !quotaPerUnit.GreaterThan(decimal.Zero) {
		return decimal.NewFromInt(1)
	}
	return quotaPerUnit
}

func maxIntValue() int {
	return int(^uint(0) >> 1)
}
