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
import type { ImageWorkshopModelCapability } from '../types'

const SIZE_PATTERN = /^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/
const RATIO_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*[:xX×]\s*(\d+(?:\.\d+)?)\s*$/

export type ImageSizeTier = '1K' | '2K' | '4K'

type ImageSizeConstraints = NonNullable<
  ImageWorkshopModelCapability['size_constraints']
>

type PresetRatio =
  | '1:1'
  | '3:2'
  | '2:3'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '21:9'

export const DEFAULT_IMAGE_SIZE_CONSTRAINTS: ImageSizeConstraints = {
  multiple: 16,
  max_edge: 3840,
  max_aspect_ratio: 3,
  min_pixels: 655_360,
  max_pixels: 8_294_400,
}

export const IMAGE_SIZE_RATIOS: Array<{
  label: PresetRatio
  value: PresetRatio
}> = [
  { label: '1:1', value: '1:1' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '21:9', value: '21:9' },
]

const TIER_PIXEL_BUDGET: Record<ImageSizeTier, number> = {
  '1K': 1_572_864,
  '2K': 4_194_304,
  '4K': DEFAULT_IMAGE_SIZE_CONSTRAINTS.max_pixels,
}

const COMMON_SIZE_PRESETS: Record<
  ImageSizeTier,
  Record<PresetRatio, string>
> = {
  '1K': {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '16:9': '1280x720',
    '9:16': '720x1280',
    '4:3': '1024x768',
    '3:4': '768x1024',
    '21:9': '1280x544',
  },
  '2K': {
    '1:1': '2048x2048',
    '3:2': '2160x1440',
    '2:3': '1440x2160',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
    '21:9': '2560x1088',
  },
  '4K': {
    '1:1': '2880x2880',
    '3:2': '3456x2304',
    '2:3': '2304x3456',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '4:3': '3200x2400',
    '3:4': '2400x3200',
    '21:9': '3840x1600',
  },
}

function roundToMultiple(value: number, multiple: number) {
  return Math.max(multiple, Math.round(value / multiple) * multiple)
}

function floorToMultiple(value: number, multiple: number) {
  return Math.max(multiple, Math.floor(value / multiple) * multiple)
}

function ceilToMultiple(value: number, multiple: number) {
  return Math.max(multiple, Math.ceil(value / multiple) * multiple)
}

export function parseImageSize(size: string) {
  const match = size.match(SIZE_PATTERN)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { width, height }
}

export function normalizeImageSize(
  size: string,
  constraints: ImageSizeConstraints = DEFAULT_IMAGE_SIZE_CONSTRAINTS
) {
  const parsed = parseImageSize(size)
  if (!parsed) return size.trim()

  let width = roundToMultiple(parsed.width, constraints.multiple)
  let height = roundToMultiple(parsed.height, constraints.multiple)

  const scaleToFit = (scale: number) => {
    width = floorToMultiple(width * scale, constraints.multiple)
    height = floorToMultiple(height * scale, constraints.multiple)
  }
  const scaleToFill = (scale: number) => {
    width = ceilToMultiple(width * scale, constraints.multiple)
    height = ceilToMultiple(height * scale, constraints.multiple)
  }

  for (let index = 0; index < 4; index += 1) {
    const maxEdge = Math.max(width, height)
    if (maxEdge > constraints.max_edge) {
      scaleToFit(constraints.max_edge / maxEdge)
    }

    if (width / height > constraints.max_aspect_ratio) {
      width = floorToMultiple(
        height * constraints.max_aspect_ratio,
        constraints.multiple
      )
    } else if (height / width > constraints.max_aspect_ratio) {
      height = floorToMultiple(
        width * constraints.max_aspect_ratio,
        constraints.multiple
      )
    }

    const pixels = width * height
    if (pixels > constraints.max_pixels) {
      scaleToFit(Math.sqrt(constraints.max_pixels / pixels))
    } else if (pixels < constraints.min_pixels) {
      scaleToFill(Math.sqrt(constraints.min_pixels / pixels))
    }
  }

  return `${width}x${height}`
}

export function parseImageRatio(ratio: string) {
  const match = ratio.match(RATIO_PATTERN)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { width, height }
}

function presetRatioKey(width: number, height: number): PresetRatio | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  const greatestCommonDivisor = (left: number, right: number): number =>
    right === 0 ? left : greatestCommonDivisor(right, left % right)
  const divisor = greatestCommonDivisor(width, height)
  const key = `${width / divisor}:${height / divisor}`
  return key in COMMON_SIZE_PRESETS['1K'] ? (key as PresetRatio) : null
}

export function calculateImageSize(tier: ImageSizeTier, ratio: string) {
  const parsed = parseImageRatio(ratio)
  if (!parsed) return null

  const preset = presetRatioKey(parsed.width, parsed.height)
  if (preset) return COMMON_SIZE_PRESETS[tier][preset]

  const targetRatio = parsed.width / parsed.height
  const pixelBudget = TIER_PIXEL_BUDGET[tier]
  let bestWidth = 0
  let bestHeight = 0
  let bestPixels = 0

  for (
    let width = DEFAULT_IMAGE_SIZE_CONSTRAINTS.multiple;
    width <= DEFAULT_IMAGE_SIZE_CONSTRAINTS.max_edge;
    width += DEFAULT_IMAGE_SIZE_CONSTRAINTS.multiple
  ) {
    const idealHeight = width / targetRatio
    const candidates = [
      Math.floor(idealHeight / DEFAULT_IMAGE_SIZE_CONSTRAINTS.multiple) *
        DEFAULT_IMAGE_SIZE_CONSTRAINTS.multiple,
      Math.ceil(idealHeight / DEFAULT_IMAGE_SIZE_CONSTRAINTS.multiple) *
        DEFAULT_IMAGE_SIZE_CONSTRAINTS.multiple,
    ]

    for (const height of candidates) {
      if (
        height < DEFAULT_IMAGE_SIZE_CONSTRAINTS.multiple ||
        height > DEFAULT_IMAGE_SIZE_CONSTRAINTS.max_edge
      ) {
        continue
      }
      const pixels = width * height
      const ratioError = Math.abs(width / height - targetRatio) / targetRatio
      if (
        pixels > pixelBudget ||
        pixels < DEFAULT_IMAGE_SIZE_CONSTRAINTS.min_pixels ||
        Math.max(width / height, height / width) >
          DEFAULT_IMAGE_SIZE_CONSTRAINTS.max_aspect_ratio ||
        ratioError > 0.01
      ) {
        continue
      }
      if (pixels > bestPixels) {
        bestWidth = width
        bestHeight = height
        bestPixels = pixels
      }
    }
  }

  return bestPixels ? `${bestWidth}x${bestHeight}` : null
}

export function findImageSizePreset(size: string) {
  const normalized = normalizeImageSize(size)
  for (const tier of Object.keys(COMMON_SIZE_PRESETS) as ImageSizeTier[]) {
    for (const ratio of IMAGE_SIZE_RATIOS) {
      if (COMMON_SIZE_PRESETS[tier][ratio.value] === normalized) {
        return { tier, ratio: ratio.value }
      }
    }
  }
  return null
}

export function isImageWorkshopSizeSupported(
  capability: ImageWorkshopModelCapability,
  size: string
) {
  if (capability.sizes.includes(size)) return true
  return Boolean(capability.supports_custom_size && parseImageSize(size))
}

export function imageSizeSummary(size: string) {
  if (!size || size === 'auto') return '自动'
  const preset = findImageSizePreset(size)
  if (preset) return `${preset.ratio} · ${preset.tier} · ${size}`
  return size
}

export function aspectRatioForSize(size?: string) {
  if (!size || size === 'auto') return '1 / 1'
  const [width, height] = size.split('x').map(Number)
  if (!width || !height) return '1 / 1'
  return `${width} / ${height}`
}
