/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

export const GREEN_KEY_COLOR = '#00FF00'
export const MAGENTA_KEY_COLOR = '#FF00FF'

const MIN_TRANSPARENT_PIXEL_RATIO = 0.01

type RGB = { r: number; g: number; b: number }

const KEY_COLORS: Record<string, RGB> = {
  [GREEN_KEY_COLOR]: { r: 0, g: 255, b: 0 },
  [MAGENTA_KEY_COLOR]: { r: 255, g: 0, b: 255 },
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function colorDistance(data: Uint8ClampedArray, offset: number, color: RGB) {
  return Math.sqrt(
    (data[offset] - color.r) ** 2 +
      (data[offset + 1] - color.g) ** 2 +
      (data[offset + 2] - color.b) ** 2
  )
}

function backgroundConfidence(
  data: Uint8ClampedArray,
  index: number,
  color: RGB
) {
  return clamp((170 - colorDistance(data, index * 4, color)) / 170, 0, 1)
}

export function detectKeyColorFromPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number
) {
  let greenScore = 0
  let magentaScore = 0
  let samples = 0

  const sample = (index: number) => {
    const offset = index * 4
    const greenDistance = colorDistance(
      data,
      offset,
      KEY_COLORS[GREEN_KEY_COLOR]
    )
    const magentaDistance = colorDistance(
      data,
      offset,
      KEY_COLORS[MAGENTA_KEY_COLOR]
    )
    greenScore += Math.max(0, 180 - greenDistance)
    magentaScore += Math.max(0, 180 - magentaDistance)
    samples += 1
  }

  for (let x = 0; x < width; x += 1) {
    sample(x)
    if (height > 1) sample((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    sample(y * width)
    if (width > 1) sample(y * width + width - 1)
  }

  if (!samples) return GREEN_KEY_COLOR
  return magentaScore > greenScore ? MAGENTA_KEY_COLOR : GREEN_KEY_COLOR
}

function buildBackgroundMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  color: RGB
) {
  const pixelCount = width * height
  const mask = new Uint8Array(pixelCount)
  const visited = new Uint8Array(pixelCount)
  const queue = new Uint32Array(pixelCount)
  let queueStart = 0
  let queueEnd = 0

  const enqueue = (index: number, threshold: number) => {
    if (index < 0 || index >= pixelCount || visited[index]) return
    visited[index] = 1
    if (backgroundConfidence(data, index, color) < threshold) return
    mask[index] = 1
    queue[queueEnd] = index
    queueEnd += 1
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0.34)
    if (height > 1) enqueue((height - 1) * width + x, 0.34)
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width, 0.34)
    if (width > 1) enqueue(y * width + width - 1, 0.34)
  }

  while (queueStart < queueEnd) {
    const index = queue[queueStart]
    queueStart += 1
    const x = index % width
    const y = Math.floor(index / width)
    const threshold = 0.22
    if (x > 0) enqueue(index - 1, threshold)
    if (x < width - 1) enqueue(index + 1, threshold)
    if (y > 0) enqueue(index - width, threshold)
    if (y < height - 1) enqueue(index + width, threshold)
  }

  return mask
}

export function removeKeyedBackgroundFromPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  keyColor: string
) {
  const color = KEY_COLORS[keyColor.toUpperCase()]
  if (!color) throw new Error('不支持的透明背景键色')
  if (data.length < width * height * 4) {
    throw new Error('透明背景像素数据尺寸不匹配')
  }

  const mask = buildBackgroundMask(data, width, height, color)
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    if (mask[index]) {
      data[offset + 3] = 0
      continue
    }

    const x = index % width
    const y = Math.floor(index / width)
    const touchesBackground =
      (x > 0 && mask[index - 1]) ||
      (x < width - 1 && mask[index + 1]) ||
      (y > 0 && mask[index - width]) ||
      (y < height - 1 && mask[index + width])
    if (touchesBackground) {
      const confidence = backgroundConfidence(data, index, color)
      data[offset + 3] = Math.min(
        data[offset + 3],
        Math.max(32, Math.round(255 * (1 - confidence * 0.8)))
      )
    }
  }
  return data
}

export function transparentPixelRatio(data: Uint8ClampedArray) {
  const pixelCount = Math.floor(data.length / 4)
  if (!pixelCount) return 0

  let transparentPixels = 0
  for (let offset = 3; offset < pixelCount * 4; offset += 4) {
    if (data[offset] < 250) transparentPixels += 1
  }
  return transparentPixels / pixelCount
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.addEventListener('load', () => {
      URL.revokeObjectURL(url)
      resolve(image)
    })
    image.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取生成图片'))
    })
    image.src = url
  })
}

export async function removeKeyedBackgroundFromBlob(blob: Blob): Promise<Blob> {
  const image = await loadImage(blob)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前浏览器不支持透明背景处理')

  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const keyColor = detectKeyColorFromPixels(
    pixels.data,
    canvas.width,
    canvas.height
  )
  removeKeyedBackgroundFromPixels(
    pixels.data,
    canvas.width,
    canvas.height,
    keyColor
  )
  if (transparentPixelRatio(pixels.data) < MIN_TRANSPARENT_PIXEL_RATIO) {
    throw new Error('生成图片没有可识别的纯色背景')
  }
  context.putImageData(pixels, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob((processed) => {
      if (processed) resolve(processed)
      else reject(new Error('透明背景处理失败'))
    }, 'image/png')
  })
}
