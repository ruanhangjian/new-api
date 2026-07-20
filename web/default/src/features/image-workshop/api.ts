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
  ImageWorkshopGenerationRequest,
  ImageWorkshopGenerationResponse,
  ImageWorkshopOptions,
  ImageWorkshopTask,
  ImageWorkshopTaskPage,
  ImageWorkshopToken,
} from './types'

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    throw new Error(response.message || '请求失败')
  }
  return response.data
}

export async function getImageWorkshopTokens() {
  const response = await api.get('/api/image-workshop/tokens')
  return unwrap(response.data as ApiResponse<ImageWorkshopToken[]>)
}

export async function getImageWorkshopOptions(tokenId: number) {
  const response = await api.get('/api/image-workshop/options', {
    params: { token_id: tokenId },
  })
  return unwrap(response.data as ApiResponse<ImageWorkshopOptions>)
}

export async function createImageWorkshopGeneration(
  request: ImageWorkshopGenerationRequest
) {
  const response = await api.post('/api/image-workshop/generations', request)
  return unwrap(response.data as ApiResponse<ImageWorkshopGenerationResponse>)
}

export async function getImageWorkshopTasks(pageSize = 50) {
  const response = await api.get('/api/image-workshop/tasks', {
    params: { page: 1, page_size: pageSize },
    disableDuplicate: true,
  } as Record<string, unknown>)
  return unwrap(response.data as ApiResponse<ImageWorkshopTaskPage>)
}

export async function getImageWorkshopTask(taskId: string) {
  const response = await api.get(
    `/api/image-workshop/tasks/${encodeURIComponent(taskId)}`,
    { disableDuplicate: true } as Record<string, unknown>
  )
  return unwrap(response.data as ApiResponse<ImageWorkshopTask>)
}
