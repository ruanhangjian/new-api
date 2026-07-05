import { api } from '@/lib/api'
import type {
  ApiResponse,
  CreateEnterpriseCdkBatchInput,
  EnterpriseCdkBalance,
  EnterpriseCdkBatch,
  EnterpriseCdkBatchDetail,
  EnterpriseCdkCode,
  EnterpriseCdkOperationLog,
  EnterpriseCdkPermission,
  EnterpriseCdkQuotaLog,
  EnterpriseCdkCustomerSummary,
  EnterpriseCdkQuotaSummary,
  EnterpriseCdkUserSearchResult,
  PageData,
} from './types'

export async function getEnterpriseCdkPermission() {
  const res = await api.get<ApiResponse<EnterpriseCdkPermission>>(
    '/api/enterprise/cdk/permission',
    { skipErrorHandler: true } as Record<string, unknown>
  )
  return res.data
}

export async function getEnterpriseCdkBalance() {
  const res = await api.get<ApiResponse<EnterpriseCdkBalance>>(
    '/api/enterprise/cdk/balance',
    { skipErrorHandler: true } as Record<string, unknown>
  )
  return res.data
}

export async function getEnterpriseCdkBalanceLogs(
  params: Record<string, unknown> = { p: 1 }
) {
  const res = await api.get<ApiResponse<PageData<EnterpriseCdkQuotaLog>>>(
    '/api/enterprise/cdk/balance/logs',
    { params: { page_size: 20, ...params } }
  )
  return res.data
}

export async function getEnterpriseCdkBatches(
  params: Record<string, unknown> = { p: 1 }
) {
  const res = await api.get<ApiResponse<PageData<EnterpriseCdkBatch>>>(
    '/api/enterprise/cdk/batches',
    { params: { page_size: 20, ...params } }
  )
  return res.data
}

export async function getEnterpriseCdkBatchDetail(
  id: number,
  params: Record<string, unknown> = {}
) {
  const res = await api.get<ApiResponse<EnterpriseCdkBatchDetail>>(
    `/api/enterprise/cdk/batches/${id}`,
    {
      params: { page_size: 100, ...params },
      skipErrorHandler: true,
    } as Record<string, unknown>
  )
  return res.data
}

export async function createEnterpriseCdkBatch(
  input: CreateEnterpriseCdkBatchInput
) {
  const res = await api.post<
    ApiResponse<{ batch: EnterpriseCdkBatch; cdks: EnterpriseCdkCode[] }>
  >('/api/enterprise/cdk/batches', input)
  return res.data
}

export async function copyEnterpriseCdkUnusedCodes(batchId: number) {
  const res = await api.post<ApiResponse<{ codes: string[]; count: number }>>(
    '/api/enterprise/cdk/copy-unused-log',
    {
      batch_id: batchId,
    }
  )
  return res.data
}

export async function exportEnterpriseCdkCodes(input: {
  batch_id?: number
  cdk_ids?: number[]
}) {
  const res = await api.post('/api/enterprise/cdk/export', input, {
    responseType: 'blob',
    skipBusinessError: true,
  } as Record<string, unknown>)
  downloadBlob(res.data as Blob, 'enterprise-cdks.csv')
}

export interface EnterpriseCdkWhitelistUser {
  user_id: number
  email: string
  username: string
  enterprise_cdk_quota: number
  created_time: number
  operator_id: number
  max_batch_create_count: number
  total_charged_quota: number
  total_consumed_quota: number
  last_charged_time: number
}

export async function adminGetEnterpriseCdkWhitelist(params = { p: 1 }) {
  const res = await api.get<ApiResponse<PageData<EnterpriseCdkWhitelistUser>>>(
    '/api/admin/enterprise/whitelist',
    { params: { page_size: 50, ...params } }
  )
  return res.data
}

export async function adminUpdateEnterpriseCdkWhitelist(input: {
  action: 'add' | 'remove'
  user_id: number
}) {
  const res = await api.put<ApiResponse>(
    '/api/admin/enterprise/whitelist',
    input
  )
  return res.data
}

export async function adminUpdateEnterpriseCdkLimit(
  userId: number,
  maxBatchCreateCount: number
) {
  const res = await api.put<ApiResponse>(
    `/api/admin/enterprise/whitelist/${userId}/limit`,
    { max_batch_create_count: maxBatchCreateCount }
  )
  return res.data
}

export async function adminAdjustEnterpriseCdkBalance(input: {
  user_id: number
  amount: string
  type: string
  remark: string
}) {
  const res = await api.post<ApiResponse>(
    '/api/admin/enterprise/balance/adjust',
    input
  )
  return res.data
}

export async function adminGetEnterpriseCdkBalanceLogs(
  params: Record<string, unknown> = {}
) {
  const res = await api.get<ApiResponse<PageData<EnterpriseCdkQuotaLog>>>(
    '/api/admin/enterprise/balance/logs',
    { params: { page_size: 50, ...params } }
  )
  return res.data
}

export async function adminGetEnterpriseCdkBatches(
  params: Record<string, unknown> = {}
) {
  const res = await api.get<ApiResponse<PageData<EnterpriseCdkBatch>>>(
    '/api/admin/enterprise/batches',
    { params: { page_size: 50, ...params } }
  )
  return res.data
}

export async function adminGetEnterpriseCdkCodes(
  params: Record<string, unknown> = {}
) {
  const res = await api.get<ApiResponse<PageData<EnterpriseCdkCode>>>(
    '/api/admin/enterprise/codes',
    { params: { page_size: 50, ...params } }
  )
  return res.data
}

export async function adminRecycleEnterpriseCdkCodes(input: {
  cdk_ids: number[]
  remark: string
}) {
  const res = await api.post<
    ApiResponse<{ refunded_count: number; refunded_quota: number }>
  >('/api/admin/enterprise/codes/recycle', input)
  return res.data
}

export async function adminSetEnterpriseCdkCodeDisabled(
  id: number,
  disabled: boolean
) {
  const res = await api.put<ApiResponse>(
    `/api/admin/enterprise/codes/${id}/disable`,
    { disabled }
  )
  return res.data
}

export async function adminExportEnterpriseCdkCodes(
  params: Record<string, unknown> = {}
) {
  const res = await api.post('/api/admin/enterprise/export', params, {
    responseType: 'blob',
    skipBusinessError: true,
  } as Record<string, unknown>)
  downloadBlob(res.data as Blob, 'enterprise-cdks-admin.csv')
}

export async function adminGetEnterpriseCdkOperationLogs(
  params: Record<string, unknown> = {}
) {
  const res = await api.get<ApiResponse<PageData<EnterpriseCdkOperationLog>>>(
    '/api/admin/enterprise/operation/logs',
    { params: { page_size: 50, ...params } }
  )
  return res.data
}

export async function adminGetEnterpriseCdkUserDetail(
  userId: number,
  params: Record<string, unknown> = {}
) {
  const res = await api.get<
    ApiResponse<{
      user: {
        id: number
        email: string
        username: string
        enterprise_cdk_quota: number
        balance: string
      }
      whitelist?: EnterpriseCdkWhitelistUser
      quota_summary: EnterpriseCdkQuotaSummary
      customer_summary: EnterpriseCdkCustomerSummary
      logs: EnterpriseCdkQuotaLog[]
      logs_page?: PageData<EnterpriseCdkQuotaLog>
      batches: EnterpriseCdkBatch[]
      batches_page?: PageData<EnterpriseCdkBatch>
    }>
  >(`/api/admin/enterprise/users/${userId}`, {
    params: { page_size: 10, ...params },
  })
  return res.data
}

export async function adminSearchEnterpriseCdkUsers(keyword: string) {
  const res = await api.get<
    ApiResponse<PageData<EnterpriseCdkUserSearchResult>>
  >('/api/user/search', {
    params: { keyword, page_size: 5, p: 1 },
  })
  return res.data
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
