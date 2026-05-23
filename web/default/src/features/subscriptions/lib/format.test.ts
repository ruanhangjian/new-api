import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { formatQuotaWithCurrency } from '@/lib/currency'
import {
  calculatePlanSubscriptionTotalQuota,
  formatPlanDisplayTotalQuota,
} from './format'

describe('calculatePlanSubscriptionTotalQuota', () => {
  test('uses the configured quota as the total when the plan never resets', () => {
    assert.equal(
      calculatePlanSubscriptionTotalQuota({
        total_amount: 100,
        duration_unit: 'month',
        duration_value: 1,
        quota_reset_period: 'never',
      }),
      100
    )
  })

  test('multiplies daily quota by the number of daily periods in the plan', () => {
    assert.equal(
      calculatePlanSubscriptionTotalQuota({
        total_amount: 100,
        duration_unit: 'day',
        duration_value: 30,
        quota_reset_period: 'daily',
      }),
      3000
    )
  })

  test('counts a partial final reset period as a usable period', () => {
    assert.equal(
      calculatePlanSubscriptionTotalQuota({
        total_amount: 100,
        duration_unit: 'day',
        duration_value: 30,
        quota_reset_period: 'weekly',
      }),
      500
    )
  })

  test('supports monthly and custom reset periods', () => {
    assert.equal(
      calculatePlanSubscriptionTotalQuota({
        total_amount: 200,
        duration_unit: 'day',
        duration_value: 90,
        quota_reset_period: 'monthly',
      }),
      600
    )

    assert.equal(
      calculatePlanSubscriptionTotalQuota({
        total_amount: 20,
        duration_unit: 'custom',
        custom_seconds: 10 * 86400,
        quota_reset_period: 'custom',
        quota_reset_custom_seconds: 3 * 86400,
      }),
      80
    )
  })

  test('keeps one quota period when the subscription is shorter than the reset interval', () => {
    assert.equal(
      calculatePlanSubscriptionTotalQuota({
        total_amount: 50,
        duration_unit: 'day',
        duration_value: 1,
        quota_reset_period: 'weekly',
      }),
      50
    )
  })

  test('returns zero for unlimited quotas', () => {
    assert.equal(
      calculatePlanSubscriptionTotalQuota({
        total_amount: 0,
        duration_unit: 'day',
        duration_value: 30,
        quota_reset_period: 'daily',
      }),
      0
    )
  })
})

describe('formatPlanDisplayTotalQuota', () => {
  test('uses the shared total quota calculation for purchase dialogs', () => {
    assert.equal(
      formatPlanDisplayTotalQuota(
        {
          total_amount: 100,
          duration_unit: 'day',
          duration_value: 30,
          quota_reset_period: 'weekly',
        },
        ((key: string) => key) as never
      ),
      formatQuotaWithCurrency(500, {
        digitsLarge: 2,
        digitsSmall: 4,
        abbreviate: false,
      })
    )
  })
})
