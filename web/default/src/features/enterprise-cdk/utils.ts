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

export function formatDateTimeLocal(timestamp?: number) {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 16)
}

export function formatQuota(quota: number | undefined, quotaPerUnit?: number) {
  const unit = quotaPerUnit && quotaPerUnit > 0 ? quotaPerUnit : 500000
  return `$${((quota ?? 0) / unit).toFixed(2)}`
}

export function getCodeStatus(code: EnterpriseCdkCode) {
  if (code.recycled_time && code.recycled_time > 0) return '已回收'
  if (code.status === CDK_STATUS.used) return '已兑换'
  if (code.status === CDK_STATUS.disabled) return '已禁用'
  if (code.expired_time && code.expired_time < Date.now() / 1000)
    return '已过期'
  return '未兑换'
}

export function getCodeStatusTone(code: EnterpriseCdkCode) {
  const status = getCodeStatus(code)
  if (status === '已回收') return 'outline'
  if (status === '已兑换') return 'secondary'
  if (status === '已禁用') return 'destructive'
  if (status === '已过期') return 'outline'
  return 'default'
}
