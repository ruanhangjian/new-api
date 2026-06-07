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
import { api } from '@/lib/api'
import type {
  ApiResponse,
  ChannelBalanceAccount,
  ChannelBalanceAccountPayload,
  ChannelBalanceOverview,
  ChannelBalanceRefreshResult,
  ChannelBalanceSettings,
  ChannelBalanceSettingsPayload,
} from './types'

export const channelBalancesQueryKey = ['channel-balances'] as const

export async function getChannelBalanceOverview(): Promise<
  ApiResponse<ChannelBalanceOverview>
> {
  const res = await api.get('/api/channel_balance/overview', {
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

export async function refreshChannelBalance(
  id: number
): Promise<ApiResponse<ChannelBalanceRefreshResult>> {
  const res = await api.post(`/api/channel_balance/accounts/${id}/refresh`)
  return res.data
}

export async function refreshAllChannelBalances(): Promise<
  ApiResponse<ChannelBalanceRefreshResult[]>
> {
  const res = await api.post('/api/channel_balance/accounts/refresh')
  return res.data
}

export async function updateChannelBalanceSettings(
  payload: ChannelBalanceSettingsPayload
): Promise<ApiResponse<ChannelBalanceSettings>> {
  const res = await api.put('/api/channel_balance/settings', payload)
  return res.data
}

export async function createChannelBalanceAccount(
  payload: ChannelBalanceAccountPayload
): Promise<ApiResponse<ChannelBalanceAccount>> {
  const res = await api.post('/api/channel_balance/accounts', payload)
  return res.data
}

export async function updateChannelBalanceAccount(
  id: number,
  payload: ChannelBalanceAccountPayload
): Promise<ApiResponse<ChannelBalanceAccount>> {
  const res = await api.put(`/api/channel_balance/accounts/${id}`, payload)
  return res.data
}

export async function deleteChannelBalanceAccount(
  id: number
): Promise<ApiResponse<null>> {
  const res = await api.delete(`/api/channel_balance/accounts/${id}`)
  return res.data
}
