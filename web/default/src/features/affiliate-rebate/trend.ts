import dayjs from '@/lib/dayjs'
import type { AffiliateRebateSettlement } from './types'

export type AffiliateRebateTrendPoint = {
  date: string
  label: string
  rewardQuota: number
}

const TREND_DAYS = 7
const MAX_BAR_HEIGHT_PERCENT = 92
const MIN_BAR_HEIGHT_PERCENT = 12

export function buildAffiliateRebateTrend(
  rows: AffiliateRebateSettlement[],
  baseDate = dayjs().format('YYYY-MM-DD')
): AffiliateRebateTrendPoint[] {
  const rewardByDate = new Map<string, number>()
  for (const row of rows) {
    const date = row.settlement_date
    rewardByDate.set(date, (rewardByDate.get(date) ?? 0) + row.reward_quota)
  }

  const end = dayjs(baseDate)
  return Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = end.subtract(TREND_DAYS - 1 - index, 'day')
    const value = date.format('YYYY-MM-DD')
    return {
      date: value,
      label: date.format('MM-DD'),
      rewardQuota: rewardByDate.get(value) ?? 0,
    }
  })
}

export function getAffiliateRebateTrendBarHeight(
  rewardQuota: number,
  maxRewardQuota: number
): number {
  if (rewardQuota <= 0 || maxRewardQuota <= 0) return 0
  const scaledHeight = (rewardQuota / maxRewardQuota) * MAX_BAR_HEIGHT_PERCENT
  return Math.min(
    MAX_BAR_HEIGHT_PERCENT,
    Math.max(MIN_BAR_HEIGHT_PERCENT, scaledHeight)
  )
}
