import type { EnterpriseCdkCode } from './types'

export const CDK_STATUS = {
  enabled: 1,
  disabled: 2,
  used: 3,
} as const

export const ENTERPRISE_CDK_HARD_MAX_BATCH_CREATE_COUNT = 10000

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
  const unit = quotaPerUnit && quotaPerUnit > 0 ? quotaPerUnit : undefined
  if (!unit) return '$0.00'
  const amount = (quota ?? 0) / unit
  const sign = amount < 0 ? '-' : ''
  return `${sign}$${Math.abs(amount).toFixed(2)}`
}

export function formatSignedQuota(
  quota: number | undefined,
  quotaPerUnit?: number
) {
  const amount = quota ?? 0
  if (amount > 0) return `+${formatQuota(amount, quotaPerUnit)}`
  return formatQuota(amount, quotaPerUnit)
}

export function formatEnterpriseCdkQuotaLogType(type: string) {
  switch (type) {
    case 'admin_add':
      return '管理员充值'
    case 'admin_deduct':
      return '管理员扣减'
    case 'admin_refund':
      return '管理员退款'
    case 'create_cdk':
      return '创建批次扣减'
    default:
      return type || '-'
  }
}

export function formatEnterpriseCdkOperationAction(action: string) {
  switch (action) {
    case 'export_user':
      return '用户导出'
    case 'export_admin':
      return '管理员导出'
    case 'view_admin':
      return '管理员查看'
    case 'copy_unused':
      return '复制未兑换'
    case 'recycle_cdks':
      return '回收 CDK'
    case 'toggle_cdk':
      return '启用/禁用 CDK'
    case 'whitelist_add':
      return '加入白名单'
    case 'whitelist_remove':
      return '移出白名单'
    case 'limit_update':
      return '更新创建上限'
    default:
      return action || '-'
  }
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
