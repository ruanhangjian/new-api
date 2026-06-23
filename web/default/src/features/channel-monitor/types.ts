export type ChannelMonitorProvider = 'openai' | 'anthropic' | 'gemini'
export type ChannelMonitorStatus =
  | 'operational'
  | 'degraded'
  | 'failed'
  | 'error'
export type ChannelMonitorAPIMode = 'chat_completions' | 'responses'
export type ChannelMonitorBodyOverrideMode = 'off' | 'merge' | 'replace'

export type ChannelMonitor = {
  id: number
  name: string
  provider: ChannelMonitorProvider
  api_mode: ChannelMonitorAPIMode
  endpoint: string
  api_key_masked: string
  has_api_key: boolean
  primary_model: string
  extra_models: string[]
  group_name: string
  enabled: boolean
  interval_seconds: number
  last_checked_at: number
  created_by: number
  template_id: number
  extra_headers: string
  body_override_mode: ChannelMonitorBodyOverrideMode
  body_override: string
  created_time: number
  updated_time: number
  primary_status: ChannelMonitorStatus | ''
  primary_latency_ms: number
  primary_ping_latency_ms: number
  availability_7d: number
  extra_models_status: Array<{
    model: string
    status: ChannelMonitorStatus | ''
    latency_ms: number
  }>
}

export type ChannelMonitorPayload = {
  name: string
  provider: ChannelMonitorProvider
  api_mode: ChannelMonitorAPIMode
  endpoint: string
  api_key?: string
  primary_model: string
  extra_models: string[]
  group_name: string
  enabled: boolean
  interval_seconds: number
  template_id: number
  extra_headers: string
  body_override_mode: ChannelMonitorBodyOverrideMode
  body_override: string
}

export type ChannelMonitorTemplate = {
  id: number
  name: string
  provider: ChannelMonitorProvider
  api_mode: ChannelMonitorAPIMode
  extra_headers: string
  body_override_mode: ChannelMonitorBodyOverrideMode
  body_override: string
  created_time: number
  updated_time: number
}

export type ChannelMonitorTemplatePayload = Omit<
  ChannelMonitorTemplate,
  'id' | 'created_time' | 'updated_time'
>

export type ChannelMonitorCheckResult = {
  monitor_id: number
  model: string
  status: ChannelMonitorStatus
  latency_ms: number
  ping_latency_ms: number
  message: string
  checked_at: number
}

export type ChannelMonitorTimelinePoint = {
  status: ChannelMonitorStatus
  latency_ms: number
  ping_latency_ms: number
  checked_at: number
}

export type UserChannelStatus = {
  id: number
  name: string
  provider: ChannelMonitorProvider
  group_name: string
  primary_model: string
  primary_status: ChannelMonitorStatus | ''
  primary_latency_ms: number
  primary_ping_latency_ms: number
  availability_7d: number
  availability_15d: number
  availability_30d: number
  extra_models: string[]
  timeline: ChannelMonitorTimelinePoint[]
  last_checked_at: number
}

export type UserChannelStatusDetail = {
  id: number
  name: string
  provider: ChannelMonitorProvider
  group_name: string
  models: Array<{
    model: string
    latest_status: ChannelMonitorStatus | ''
    latest_latency_ms: number
    availability_7d: number
    availability_15d: number
    availability_30d: number
    avg_latency_7d_ms: number
    last_checked_at: number
  }>
}

export type PageInfo<T> = {
  page: number
  page_size: number
  total: number
  items: T[]
}

export type ApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}
