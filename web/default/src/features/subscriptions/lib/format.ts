/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { TFunction } from 'i18next'
import { formatQuotaWithCurrency } from '@/lib/currency'
import dayjs from '@/lib/dayjs'
import type { SubscriptionPlan } from '../types'

const SECONDS_PER_HOUR = 3600
const SECONDS_PER_DAY = 86400
const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY
const SECONDS_PER_MONTH = 30 * SECONDS_PER_DAY
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY

function getPlanDurationSeconds(plan: Partial<SubscriptionPlan>): number {
  const unit = plan?.duration_unit || 'month'
  const value = Number(plan?.duration_value || 0)
  if (value <= 0 && unit !== 'custom') return 0

  if (unit === 'year') return value * SECONDS_PER_YEAR
  if (unit === 'month') return value * SECONDS_PER_MONTH
  if (unit === 'day') return value * SECONDS_PER_DAY
  if (unit === 'hour') return value * SECONDS_PER_HOUR
  if (unit === 'custom') return Number(plan?.custom_seconds || 0)

  return 0
}

function getQuotaResetSeconds(plan: Partial<SubscriptionPlan>): number {
  const period = plan?.quota_reset_period || 'never'
  if (period === 'daily') return SECONDS_PER_DAY
  if (period === 'weekly') return SECONDS_PER_WEEK
  if (period === 'monthly') return SECONDS_PER_MONTH
  if (period === 'custom') return Number(plan?.quota_reset_custom_seconds || 0)
  return 0
}

export function getPlanDurationDays(plan: Partial<SubscriptionPlan>): number {
  const unit = plan?.duration_unit || 'month'
  const value = Number(plan?.duration_value || 0)
  if (value <= 0 && unit !== 'custom') return 0

  if (unit === 'year') return value * 365
  if (unit === 'month') return value * 30
  if (unit === 'day') return value
  if (unit === 'hour') return Math.ceil(value / 24)
  if (unit === 'custom') {
    const seconds = Number(plan?.custom_seconds || 0)
    return seconds > 0 ? Math.ceil(seconds / 86400) : 0
  }

  return 0
}

export function formatDuration(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const unit = plan?.duration_unit || 'month'
  const value = plan?.duration_value || 1
  const unitLabels: Record<string, string> = {
    year: t('years'),
    month: t('months'),
    day: t('days'),
    hour: t('hours'),
    custom: t('Custom (seconds)'),
  }
  if (unit === 'custom') {
    const seconds = plan?.custom_seconds || 0
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('days')}`
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('hours')}`
    return `${seconds} ${t('seconds')}`
  }
  return `${value} ${unitLabels[unit] || unit}`
}

export function formatPlanDisplayTotalQuota(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const totalAmount = Number(plan?.total_amount || 0)
  if (totalAmount <= 0) return t('Unlimited')

  const formatPlanQuota = (quota: number) =>
    formatQuotaWithCurrency(quota, {
      digitsLarge: 2,
      digitsSmall: 4,
      abbreviate: false,
    })

  return formatPlanQuota(calculatePlanSubscriptionTotalQuota(plan))
}

export function formatResetPeriod(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const period = plan?.quota_reset_period || 'never'
  if (period === 'daily') return t('Daily')
  if (period === 'weekly') return t('Weekly')
  if (period === 'monthly') return t('Monthly')
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0)
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('days')}`
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('hours')}`
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('minutes')}`
    return `${seconds} ${t('seconds')}`
  }
  return t('No Reset')
}

export function splitSellingPoints(
  value: string | undefined,
  fallback: string
): string[] {
  const points = (value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
  return points.length > 0 ? points : [fallback]
}

export function getPlanResetQuotaLabel(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const period = plan?.quota_reset_period || 'never'
  if (period === 'daily') return t('Daily Quota')
  if (period === 'weekly') return t('Weekly Quota')
  if (period === 'monthly') return t('Monthly Quota')
  return t('Quota')
}

export function formatPlanDailyQuota(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const totalAmount = Number(plan?.total_amount || 0)
  if (totalAmount <= 0) return t('Unlimited')
  return formatQuotaWithCurrency(totalAmount, {
    digitsLarge: 2,
    digitsSmall: 4,
    abbreviate: false,
  })
}

export function calculatePlanSubscriptionTotalQuota(
  plan: Partial<SubscriptionPlan>
): number {
  const totalAmount = Number(plan?.total_amount || 0)
  if (totalAmount <= 0) return 0

  const durationSeconds = getPlanDurationSeconds(plan)
  const resetSeconds = getQuotaResetSeconds(plan)
  if (durationSeconds <= 0 || resetSeconds <= 0) return totalAmount
  if (durationSeconds <= resetSeconds) return totalAmount

  return totalAmount * Math.ceil(durationSeconds / resetSeconds)
}

export function formatPlanSubscriptionTotalQuota(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const totalAmount = Number(plan?.total_amount || 0)
  if (totalAmount <= 0) return t('Unlimited')

  return formatQuotaWithCurrency(calculatePlanSubscriptionTotalQuota(plan), {
    digitsLarge: 2,
    digitsSmall: 4,
    abbreviate: false,
  })
}

export function formatTimestamp(ts: number): string {
  if (!ts) return '-'
  return dayjs(ts * 1000).format('YYYY-MM-DD HH:mm:ss')
}
