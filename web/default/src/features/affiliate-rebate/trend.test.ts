import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildAffiliateRebateTrend,
  getAffiliateRebateTrendBarHeight,
} from './trend'
import type { AffiliateRebateSettlement } from './types'

function settlement(
  settlementDate: string,
  rewardQuota: number
): AffiliateRebateSettlement {
  return {
    id: Number(settlementDate.replaceAll('-', '')),
    inviter_id: 1,
    invitee_id: 2,
    settlement_date: settlementDate,
    consumed_quota: rewardQuota * 50,
    reward_quota: rewardQuota,
    rate: 0.02,
    status: 'settled',
    created_at: 0,
    updated_at: 0,
  }
}

describe('affiliate rebate trend helpers', () => {
  test('fills the previous seven calendar days with zero values', () => {
    const trend = buildAffiliateRebateTrend(
      [settlement('2026-06-27', 120), settlement('2026-06-23', 30)],
      '2026-06-29'
    )

    assert.deepEqual(
      trend.map((point) => [point.date, point.rewardQuota]),
      [
        ['2026-06-23', 30],
        ['2026-06-24', 0],
        ['2026-06-25', 0],
        ['2026-06-26', 0],
        ['2026-06-27', 120],
        ['2026-06-28', 0],
        ['2026-06-29', 0],
      ]
    )
  })

  test('keeps chart bars within a readable height range', () => {
    assert.equal(getAffiliateRebateTrendBarHeight(0, 100), 0)
    assert.equal(getAffiliateRebateTrendBarHeight(1, 100), 12)
    assert.equal(getAffiliateRebateTrendBarHeight(100, 100), 92)
    assert.equal(getAffiliateRebateTrendBarHeight(1000, 100), 92)
  })
})
