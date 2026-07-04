import type { EnterpriseCdkCode } from './types'

export const CDK_STATUS = {
  enabled: 1,
  disabled: 2,
  used: 3,
} as const

export function formatTime(timestamp?: number, emptyText = '-') {
  if (!timestamp) return emptyText
  return new Date(timestamp * 1000).toLocaleString()
}

export function formatQuota(quota: number | undefined, quotaPerUnit?: number) {
  const unit = quotaPerUnit && quotaPerUnit > 0 ? quotaPerUnit : 500000
  return `$${((quota ?? 0) / unit).toFixed(2)}`
}

export function getCodeStatus(code: EnterpriseCdkCode) {
  if (code.status === CDK_STATUS.used) return '已兑换'
  if (code.status === CDK_STATUS.disabled) return '已禁用'
  if (code.expired_time && code.expired_time < Date.now() / 1000)
    return '已过期'
  return '未兑换'
}

export function getCodeStatusTone(code: EnterpriseCdkCode) {
  const status = getCodeStatus(code)
  if (status === '已兑换') return 'secondary'
  if (status === '已禁用') return 'destructive'
  if (status === '已过期') return 'outline'
  return 'default'
}
