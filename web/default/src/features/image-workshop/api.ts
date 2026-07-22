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
  ImageWorkshopDeleteResponse,
  ImageWorkshopDeleteScope,
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
  const response = await api.get('/api/image-workshop/tokens', {
    skipBusinessError: true,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return unwrap(response.data as ApiResponse<ImageWorkshopToken[]>)
}

export async function getImageWorkshopOptions(tokenId: number) {
  const response = await api.get('/api/image-workshop/options', {
    params: { token_id: tokenId },
    skipBusinessError: true,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return unwrap(response.data as ApiResponse<ImageWorkshopOptions>)
}

export async function createImageWorkshopGeneration(
  request: ImageWorkshopGenerationRequest
) {
  try {
    const referenceImages = request.reference_images || []
    let payload: ImageWorkshopGenerationRequest | FormData = request
    if (referenceImages.length) {
      const form = new FormData()
      form.append('token_id', String(request.token_id))
      form.append('model', request.model)
      form.append('prompt', request.prompt)
      form.append('n', String(request.n))
      form.append('size', request.size)
      form.append('quality', request.quality)
      if (request.output_format) {
        form.append('output_format', request.output_format)
      }
      if (request.transparent_output) {
        form.append('transparent_output', 'true')
      }
      referenceImages.forEach((file) => form.append('image[]', file, file.name))
      payload = form
    }
    const response = await api.post(
      '/api/image-workshop/generations',
      payload,
      {
        skipBusinessError: true,
        skipErrorHandler: true,
      } as Record<string, unknown>
    )
    return unwrap(response.data as ApiResponse<ImageWorkshopGenerationResponse>)
  } catch (error) {
    const responseData = (
      error as {
        response?: {
          data?: {
            message?: unknown
            title?: unknown
            error?: { message?: unknown }
          }
        }
      }
    )?.response?.data
    const candidates = [
      responseData?.message,
      responseData?.error?.message,
      responseData?.title,
      error instanceof Error ? error.message : undefined,
    ]
    const message = candidates.find(
      (candidate): candidate is string =>
        typeof candidate === 'string' &&
        Boolean(candidate.trim()) &&
        !/^Request failed with status code \d+$/i.test(candidate.trim())
    )
    throw new Error(
      message?.trim()
        ? `任务提交失败：${message.trim()}`
        : '任务提交失败，请稍后重试',
      { cause: error }
    )
  }
}

export async function getImageWorkshopTasks(pageSize = 50) {
  const response = await api.get('/api/image-workshop/tasks', {
    params: { page: 1, page_size: pageSize },
    disableDuplicate: true,
    skipBusinessError: true,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return unwrap(response.data as ApiResponse<ImageWorkshopTaskPage>)
}

export async function getImageWorkshopTask(taskId: string) {
  const response = await api.get(
    `/api/image-workshop/tasks/${encodeURIComponent(taskId)}`,
    {
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    } as Record<string, unknown>
  )
  return unwrap(response.data as ApiResponse<ImageWorkshopTask>)
}

export async function retryImageWorkshopTask(taskId: string) {
  try {
    const response = await api.post(
      `/api/image-workshop/tasks/${encodeURIComponent(taskId)}/retry`,
      undefined,
      {
        skipBusinessError: true,
        skipErrorHandler: true,
      } as Record<string, unknown>
    )
    return unwrap(response.data as ApiResponse<ImageWorkshopTask>)
  } catch (error) {
    const responseData = (
      error as {
        response?: {
          data?: {
            message?: unknown
            title?: unknown
            error?: { message?: unknown }
          }
        }
      }
    )?.response?.data
    const candidates = [
      responseData?.message,
      responseData?.error?.message,
      responseData?.title,
      error instanceof Error ? error.message : undefined,
    ]
    const message = candidates.find(
      (candidate): candidate is string =>
        typeof candidate === 'string' &&
        Boolean(candidate.trim()) &&
        !/^Request failed with status code \d+$/i.test(candidate.trim())
    )
    throw new Error(
      message?.trim()
        ? `重新生成失败：${message.trim()}`
        : '重新生成失败，请稍后重试',
      { cause: error }
    )
  }
}

export async function deleteImageWorkshopTasks(taskIds: string[]) {
  const response = await api.delete('/api/image-workshop/tasks', {
    data: { task_ids: taskIds },
    skipBusinessError: true,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return unwrap(response.data as ApiResponse<ImageWorkshopDeleteResponse>)
}

export async function deleteImageWorkshopTasksByScope(
  scope: ImageWorkshopDeleteScope
) {
  const response = await api.delete('/api/image-workshop/tasks', {
    params: { scope },
    skipBusinessError: true,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return unwrap(response.data as ApiResponse<ImageWorkshopDeleteResponse>)
}
