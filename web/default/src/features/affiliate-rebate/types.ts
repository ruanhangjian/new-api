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
export type AffiliateInviteeStatus = 'inactive' | 'below_minimum' | 'pending'

export type AffiliateInviteeSummary = {
  user_id: number
  username: string
  display_name?: string
  registered_at: number
  today_consumed_quota: number
  tomorrow_reward_quota: number
  total_reward_quota: number
  status: AffiliateInviteeStatus
}

export type AffiliateRebateOverview = {
  enabled: boolean
  rate: number
  daily_cap_quota: number
  min_settlement_quota: number
  start_time: number
  pending_reward_quota: number
  total_reward_quota: number
  invite_count: number
  today_reward_quota: number
  invitees: AffiliateInviteeSummary[]
}

export type AffiliateRebateSettlement = {
  id: number
  inviter_id: number
  invitee_id: number
  settlement_date: string
  consumed_quota: number
  reward_quota: number
  rate: number
  status: string
  created_at: number
  updated_at: number
}

export type AffiliateRebateDailySettlement = {
  settlement_date: string
  reward_quota: number
}

export type ApiResponse<T> = {
  success: boolean
  message: string
  data?: T
}
