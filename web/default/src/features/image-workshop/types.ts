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
export type ApiResponse<T> = {
  success: boolean
  message?: string
  data: T
}

export type ImageWorkshopToken = {
  id: number
  name: string
  key: string
  group: string
  status: number
  created_time: number
  accessed_time: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  used_quota: number
  model_limits_enabled: boolean
  model_limits: string
  cross_group_retry: boolean
}

export type ImageWorkshopGenerationPayload = {
  token_id: number
  prompt: string
  model: string
  size: string
  quality: string
  n: number
}

export type ImageWorkshopGenerationInput = {
  tokenId: number
  prompt: string
  model: string
  size: string
  quality: string
  count: string
}

export type ImageWorkshopGenerationResponse = {
  task_id: string
  status: ImageWorkshopTaskStatus
}

export type ImageWorkshopTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | string

export type ImageWorkshopTaskError = {
  message: string
}

export type ImageWorkshopResultItem = {
  url?: string
  b64_json?: string
  revised_prompt?: string
}

export type ImageWorkshopResult = {
  created?: number
  data?: ImageWorkshopResultItem[]
}

export type ImageWorkshopTask = {
  task_id: string
  status: ImageWorkshopTaskStatus
  result?: ImageWorkshopResult | string | null
  error?: ImageWorkshopTaskError | null
}

export type ImageWorkshopResultImage = {
  src: string
  revisedPrompt: string
}

export type ImageWorkshopTaskRecord = {
  taskId: string
  prompt: string
  model: string
  size: string
  quality: string
  count: number
  status: ImageWorkshopTaskStatus
  createdAt: number
  images: ImageWorkshopResultImage[]
  errorMessage: string
}
