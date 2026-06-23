import { api } from '@/lib/api'
import type {
  ApiResponse,
  ChannelMonitor,
  ChannelMonitorCheckResult,
  ChannelMonitorPayload,
  ChannelMonitorTemplate,
  ChannelMonitorTemplatePayload,
  PageInfo,
  UserChannelStatus,
  UserChannelStatusDetail,
} from './types'

export const channelMonitorsQueryKey = ['channel-monitors'] as const
export const channelStatusQueryKey = ['channel-status'] as const

export async function listChannelMonitors(params: {
  search?: string
  provider?: string
  enabled?: string
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageInfo<ChannelMonitor>>> {
  const res = await api.get('/api/channel_monitor', { params })
  return res.data
}

export async function createChannelMonitor(
  payload: ChannelMonitorPayload
): Promise<ApiResponse<ChannelMonitor>> {
  const res = await api.post('/api/channel_monitor', payload)
  return res.data
}

export async function updateChannelMonitor(
  id: number,
  payload: ChannelMonitorPayload
): Promise<ApiResponse<ChannelMonitor>> {
  const res = await api.put(`/api/channel_monitor/${id}`, payload)
  return res.data
}

export async function deleteChannelMonitor(id: number): Promise<ApiResponse<null>> {
  const res = await api.delete(`/api/channel_monitor/${id}`)
  return res.data
}

export async function runChannelMonitor(
  id: number
): Promise<ApiResponse<ChannelMonitorCheckResult[]>> {
  const res = await api.post(`/api/channel_monitor/${id}/run`)
  return res.data
}

export async function listChannelMonitorTemplates(): Promise<
  ApiResponse<ChannelMonitorTemplate[]>
> {
  const res = await api.get('/api/channel_monitor/templates')
  return res.data
}

export async function createChannelMonitorTemplate(
  payload: ChannelMonitorTemplatePayload
): Promise<ApiResponse<ChannelMonitorTemplate>> {
  const res = await api.post('/api/channel_monitor/templates', payload)
  return res.data
}

export async function updateChannelMonitorTemplate(
  id: number,
  payload: ChannelMonitorTemplatePayload
): Promise<ApiResponse<ChannelMonitorTemplate>> {
  const res = await api.put(`/api/channel_monitor/templates/${id}`, payload)
  return res.data
}

export async function deleteChannelMonitorTemplate(
  id: number
): Promise<ApiResponse<null>> {
  const res = await api.delete(`/api/channel_monitor/templates/${id}`)
  return res.data
}

export async function listChannelStatus(): Promise<
  ApiResponse<UserChannelStatus[]>
> {
  const res = await api.get('/api/channel_status', {
    disableDuplicate: true,
  } as Record<string, unknown>)
  return res.data
}

export async function getChannelStatusDetail(
  id: number
): Promise<ApiResponse<UserChannelStatusDetail>> {
  const res = await api.get(`/api/channel_status/${id}`)
  return res.data
}
