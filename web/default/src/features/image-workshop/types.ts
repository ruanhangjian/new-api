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
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
}

export type ImageWorkshopModelCapability = {
  model: string
  sizes: string[]
  size_tiers?: Array<'1K' | '2K' | '4K'>
  aspect_ratios?: string[]
  supports_custom_size?: boolean
  size_constraints?: {
    multiple: number
    max_edge: number
    max_aspect_ratio: number
    min_pixels: number
    max_pixels: number
  }
  qualities: string[]
  output_formats: string[]
  default_size: string
  default_quality: string
  default_output_format?: string
  max_images: number
  supports_reference_images: boolean
  max_reference_images?: number
  supports_transparent_background: boolean
}

export type ImageWorkshopOptions = {
  token_id: number
  models: ImageWorkshopModelCapability[]
}

export type ImageWorkshopGenerationRequest = {
  token_id: number
  model: string
  prompt: string
  n: number
  size: string
  quality: string
  output_format?: string
  transparent_output?: boolean
  reference_images?: File[]
}

export type ImageWorkshopGenerationResponse = {
  task_id: string
  status: string
}

export type ImageWorkshopResultImage = {
  url: string
  revised_prompt?: string
}

export type ImageWorkshopResult = {
  created?: number
  data: ImageWorkshopResultImage[]
}

export type ImageWorkshopTaskError = {
  code?: string
  message?: string
}

export type ImageWorkshopTask = {
  task_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | string
  progress: string
  model?: string
  prompt?: string
  n: number
  size?: string
  quality?: string
  output_format?: string
  transparent_output?: boolean
  billing_tier?: '1K' | '2K' | '4K'
  billing_multiplier?: number
  billing_unit_price?: number
  billing_strategy?: string
  billing_channel_id?: number
  reference_image_count?: number
  output_sizes?: string[]
  submit_time: number
  start_time?: number
  finish_time?: number
  expires_at?: number
  result_available: boolean
  result?: ImageWorkshopResult
  error?: ImageWorkshopTaskError
}

export type ImageWorkshopTaskPage = {
  page: number
  page_size: number
  total: number
  items: ImageWorkshopTask[]
}

export type ImageWorkshopDeleteScope = 'before_3d' | 'before_7d' | 'all'

export type ImageWorkshopDeleteResponse = {
  deleted: number
  task_ids: string[]
}

export type LocalImageWorkshopWork = {
  key: string
  userId: number
  taskId: string
  imageIndex: number
  blob: Blob
  prompt: string
  model: string
  size: string
  quality: string
  outputFormat: string
  transparentOutput?: boolean
  transparentProcessingFailed?: boolean
  originalBlob?: Blob
  createdAt: number
  submittedAt?: number
  revisedPrompt?: string
}

export type InspirationCase = {
  id: string
  title: string
  category: string
  tags: string[]
  prompt: string
  thumbnailUrl?: string
  thumbnailFallbackUrl?: string
  sourceLabel?: string
  sourceUrl?: string
  featured: boolean
  kind: 'case' | 'trending'
}

export type InspirationTemplate = {
  id: string
  title: string
  kind: 'text' | 'json' | 'tips'
  content: string
}

export type InspirationTemplateGroup = {
  id: string
  title: string
  coverUrl?: string
  tags: string[]
  entries: InspirationTemplate[]
}

export type InspirationLibrary = {
  cases: InspirationCase[]
  trending: InspirationCase[]
  templateGroups: InspirationTemplateGroup[]
}
