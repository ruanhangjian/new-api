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
  AffiliateRebateOverview,
  AffiliateRebateSettlement,
  ApiResponse,
} from './types'

export type AffiliateTransferRequest = {
  quota: number
}

export async function getAffiliateRebateOverview(): Promise<
  ApiResponse<AffiliateRebateOverview>
> {
  const res = await api.get('/api/user/affiliate-rebate/overview')
  return res.data
}

export async function getAffiliateRebateSettlements(
  inviteeId: number,
  limit = 7
): Promise<ApiResponse<AffiliateRebateSettlement[]>> {
  const res = await api.get(
    `/api/user/affiliate-rebate/invitees/${inviteeId}/settlements`,
    { params: { limit } }
  )
  return res.data
}

export async function getAffiliateCode(): Promise<ApiResponse<string>> {
  const res = await api.get('/api/user/aff')
  return res.data
}

export async function transferAffiliateQuota(
  request: AffiliateTransferRequest
): Promise<ApiResponse<null>> {
  const res = await api.post('/api/user/aff_transfer', request)
  return res.data
}
