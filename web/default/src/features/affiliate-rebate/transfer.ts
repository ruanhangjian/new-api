import { DEFAULT_CURRENCY_CONFIG } from '@/stores/system-config-store'

export const MIN_AFFILIATE_TRANSFER_QUOTA =
  DEFAULT_CURRENCY_CONFIG.quotaPerUnit / 100

export function canTransferAffiliateReward(availableQuota: number): boolean {
  return availableQuota >= MIN_AFFILIATE_TRANSFER_QUOTA
}

export function getDefaultAffiliateTransferAmount(
  availableQuota: number
): number {
  if (!canTransferAffiliateReward(availableQuota))
    return MIN_AFFILIATE_TRANSFER_QUOTA
  return availableQuota
}
