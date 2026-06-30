import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { QUOTA_PER_DOLLAR } from '@/features/wallet/constants'
import {
  canTransferAffiliateReward,
  getDefaultAffiliateTransferAmount,
} from './transfer'

describe('affiliate rebate transfer helpers', () => {
  test('requires at least the minimum transferable reward quota', () => {
    assert.equal(canTransferAffiliateReward(QUOTA_PER_DOLLAR / 100 - 1), false)
    assert.equal(canTransferAffiliateReward(QUOTA_PER_DOLLAR / 100), true)
  })

  test('defaults to transferring all currently available reward quota', () => {
    assert.equal(
      getDefaultAffiliateTransferAmount(QUOTA_PER_DOLLAR * 3),
      QUOTA_PER_DOLLAR * 3
    )
  })
})
