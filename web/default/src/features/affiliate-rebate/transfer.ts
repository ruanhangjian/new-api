import { QUOTA_PER_DOLLAR } from '@/features/wallet/constants'

export function canTransferAffiliateReward(availableQuota: number): boolean {
  return availableQuota >= QUOTA_PER_DOLLAR
}

export function getDefaultAffiliateTransferAmount(
  availableQuota: number
): number {
  if (!canTransferAffiliateReward(availableQuota)) return QUOTA_PER_DOLLAR
  return availableQuota
}
