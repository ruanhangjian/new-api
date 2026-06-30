import { QUOTA_PER_DOLLAR } from '@/features/wallet/constants'

const MIN_AFFILIATE_TRANSFER_QUOTA = QUOTA_PER_DOLLAR / 100

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
