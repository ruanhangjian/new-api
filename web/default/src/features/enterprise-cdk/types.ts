export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface PageData<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface EnterpriseCdkPermission {
  has_permission: boolean
  max_batch_create_count?: number
}

export interface EnterpriseCdkBalance {
  balance: string
  balance_quota: number
  created_quota: number
  unused_quota: number
  used_quota: number
}

export interface EnterpriseCdkBatchStats {
  batch_id: number
  total_count: number
  unused_count: number
  used_count: number
  expired_count: number
  disabled_count: number
}

export interface EnterpriseCdkBatch {
  id: number
  creator_user_id: number
  creator_email?: string
  creator_name?: string
  name: string
  remark: string
  quota: number
  count: number
  total_quota: number
  expired_time: number
  created_time: number
  stats?: EnterpriseCdkBatchStats
  unused_count?: number
  used_count?: number
  expired_count?: number
  disabled_count?: number
}

export interface EnterpriseCdkCode {
  id: number
  user_id: number
  batch_id: number
  batch_name: string
  creator_email?: string
  key: string
  name: string
  quota: number
  status: number
  created_time: number
  redeemed_time: number
  expired_time: number
  used_user_id: number
  used_user_email?: string
  used_user_display?: string
  recycled_time?: number
  recycle_operator_id?: number
  recycle_quota_returned?: number
}

export interface EnterpriseCdkQuotaLog {
  id: number
  user_id: number
  user_email?: string
  operator_id: number
  operator_email?: string
  type: string
  amount: number
  balance_before: number
  balance_after: number
  related_batch_id: number
  related_cdk_count: number
  batch_name?: string
  remark: string
  created_time: number
}

export interface CreateEnterpriseCdkBatchInput {
  name: string
  remark?: string
  quota: string
  count: number
  expired_time?: number
}

export interface EnterpriseCdkBatchDetail {
  batch: EnterpriseCdkBatch
  cdks: PageData<EnterpriseCdkCode>
}

export interface EnterpriseCdkOperationLog {
  id: number
  operator_id: number
  operator_email?: string
  target_user_id: number
  target_user_email?: string
  action: string
  batch_id: number
  batch_name?: string
  cdk_count: number
  request_summary: string
  remark: string
  created_time: number
}

export interface EnterpriseCdkUserSearchResult {
  id: number
  username: string
  display_name?: string
  email?: string
  enterprise_cdk_quota?: number
  created_at?: number
}

export interface EnterpriseCdkQuotaSummary {
  total_charged_quota: number
  total_consumed_quota: number
  total_refunded_quota: number
}

export interface EnterpriseCdkCustomerSummary {
  batch_count: number
  total_cdks: number
  redeemed_cdks: number
  unused_cdks: number
  expired_cdks: number
  disabled_cdks: number
}
