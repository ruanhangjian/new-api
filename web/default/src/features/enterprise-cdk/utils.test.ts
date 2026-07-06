import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  calculateEnterpriseCdkAdjustedBalance,
  formatEnterpriseCdkRedeemerDisplay,
  formatEnterpriseCdkBalanceActionLabel,
  formatEnterpriseCdkAuthorizedCount,
  getEnterpriseCdkExpiryPresetDate,
} from './utils'

describe('getEnterpriseCdkExpiryPresetDate', () => {
  test('returns undefined for never expires', () => {
    const baseDate = new Date(2026, 6, 4, 10, 20, 30, 456)

    assert.equal(getEnterpriseCdkExpiryPresetDate('never', baseDate), undefined)
  })

  test('calculates day week and month presets from the same base time', () => {
    const baseDate = new Date(2026, 6, 4, 10, 20, 30, 456)

    assert.equal(
      getEnterpriseCdkExpiryPresetDate('1_day', baseDate)?.getTime(),
      new Date(2026, 6, 5, 10, 20, 0, 0).getTime()
    )
    assert.equal(
      getEnterpriseCdkExpiryPresetDate('1_week', baseDate)?.getTime(),
      new Date(2026, 6, 11, 10, 20, 0, 0).getTime()
    )
    assert.equal(
      getEnterpriseCdkExpiryPresetDate('1_month', baseDate)?.getTime(),
      new Date(2026, 7, 4, 10, 20, 0, 0).getTime()
    )
  })
})

describe('formatEnterpriseCdkAuthorizedCount', () => {
  test('formats the authorized enterprise user count', () => {
    assert.equal(
      formatEnterpriseCdkAuthorizedCount(3),
      '共 3 位企业用户已获授权'
    )
  })

  test('normalizes invalid totals to zero', () => {
    assert.equal(
      formatEnterpriseCdkAuthorizedCount(undefined),
      '共 0 位企业用户已获授权'
    )
  })
})

describe('formatEnterpriseCdkBalanceActionLabel', () => {
  test('uses recharge for zero balance and adjust for positive balance', () => {
    assert.equal(formatEnterpriseCdkBalanceActionLabel(0), '充值')
    assert.equal(formatEnterpriseCdkBalanceActionLabel(850), '调整余额')
  })
})

describe('calculateEnterpriseCdkAdjustedBalance', () => {
  test('adds or subtracts the entered USD amount by operation type', () => {
    assert.equal(
      calculateEnterpriseCdkAdjustedBalance(1000, '10', 'admin_add', 100),
      2000
    )
    assert.equal(
      calculateEnterpriseCdkAdjustedBalance(1000, '10', 'admin_refund', 100),
      2000
    )
    assert.equal(
      calculateEnterpriseCdkAdjustedBalance(1000, '10', 'admin_deduct', 100),
      0
    )
  })
})

describe('formatEnterpriseCdkRedeemerDisplay', () => {
  test('uses backend display field before legacy fields', () => {
    assert.equal(
      formatEnterpriseCdkRedeemerDisplay({
        used_user_display: '张三 / 市场部',
        used_user_email: 'zhang@example.com',
        used_user_id: 12,
      }),
      '张三 / 市场部'
    )
  })

  test('falls back to email then user id', () => {
    assert.equal(
      formatEnterpriseCdkRedeemerDisplay({
        used_user_email: 'li@example.com',
        used_user_id: 13,
      }),
      'li@example.com'
    )
    assert.equal(formatEnterpriseCdkRedeemerDisplay({ used_user_id: 14 }), '14')
    assert.equal(formatEnterpriseCdkRedeemerDisplay({}), '-')
  })
})
