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
export type ChannelBalanceAccountType = 'newapi' | 'sub2api'

export type ChannelBalanceAccount = {
  id: number
  name: string
  type: ChannelBalanceAccountType
  base_url: string
  recharge_url: string
  upstream_user_id: number
  enabled: boolean
  balance: number
  unit: string
  balance_updated_time: number
  threshold: number
  alert_enabled: boolean
  alert_cooldown_hours: number
  last_alert_time: number
  remark: string
  created_time: number
  updated_time: number
  has_key: boolean
  low_balance: boolean
}

export type ChannelBalanceSummary = {
  total: number
  monitored: number
  low_balance: number
  alert_enabled: number
  last_refresh_time: number
}

export type ChannelBalanceSettings = {
  auto_refresh_minutes: number
}

export type ChannelBalanceOverview = {
  summary: ChannelBalanceSummary
  settings: ChannelBalanceSettings
  items: ChannelBalanceAccount[]
}

export type ChannelBalanceAccountPayload = {
  name: string
  type: ChannelBalanceAccountType
  base_url: string
  recharge_url?: string
  upstream_user_id?: number
  key?: string
  enabled?: boolean
  threshold?: number
  alert_enabled?: boolean
  alert_cooldown_hours?: number
  remark?: string
}

export type ChannelBalanceRefreshResult = {
  id: number
  success: boolean
  message: string
  balance?: number
  unit?: string
}

export type ChannelBalanceSettingsPayload = {
  auto_refresh_minutes: number
}

export type ApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}
