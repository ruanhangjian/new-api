import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { DEFAULT_CURRENCY_CONFIG } from '@/stores/system-config-store'
import {
  canTransferAffiliateReward,
  getDefaultAffiliateTransferAmount,
} from './transfer'

const QUOTA_PER_UNIT = DEFAULT_CURRENCY_CONFIG.quotaPerUnit

describe('affiliate rebate transfer helpers', () => {
  test('requires at least the minimum transferable reward quota', () => {
    assert.equal(canTransferAffiliateReward(QUOTA_PER_UNIT / 100 - 1), false)
    assert.equal(canTransferAffiliateReward(QUOTA_PER_UNIT / 100), true)
  })

  test('defaults to transferring all currently available reward quota', () => {
    assert.equal(
      getDefaultAffiliateTransferAmount(QUOTA_PER_UNIT * 3),
      QUOTA_PER_UNIT * 3
    )
  })
})
