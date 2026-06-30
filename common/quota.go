package common

func GetTrustQuota() int {
	return int(10 * QuotaPerUnit)
}

func GetMinAffiliateTransferQuota() int {
	return int(QuotaPerUnit / 100)
}
