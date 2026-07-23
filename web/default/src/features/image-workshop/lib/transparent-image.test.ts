import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  detectKeyColorFromPixels,
  GREEN_KEY_COLOR,
  MAGENTA_KEY_COLOR,
  removeKeyedBackgroundFromPixels,
  transparentPixelRatio,
} from './transparent-image'

function pixels(
  width: number,
  height: number,
  color: [number, number, number]
) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    data[offset] = color[0]
    data[offset + 1] = color[1]
    data[offset + 2] = color[2]
    data[offset + 3] = 255
  }
  return data
}

describe('transparent image post-processing', () => {
  test('removes a connected green background and keeps the subject', () => {
    const data = pixels(3, 3, [0, 255, 0])
    const center = 4 * 4
    data[center] = 230
    data[center + 1] = 40
    data[center + 2] = 40

    assert.equal(detectKeyColorFromPixels(data, 3, 3), GREEN_KEY_COLOR)
    removeKeyedBackgroundFromPixels(data, 3, 3, GREEN_KEY_COLOR)

    assert.equal(data[3], 0)
    assert.equal(data[center + 3], 255)
    assert.ok(transparentPixelRatio(data) > 0.8)
  })

  test('detects and removes a magenta background', () => {
    const data = pixels(3, 3, [255, 0, 255])
    const center = 4 * 4
    data[center] = 40
    data[center + 1] = 80
    data[center + 2] = 230

    assert.equal(detectKeyColorFromPixels(data, 3, 3), MAGENTA_KEY_COLOR)
    removeKeyedBackgroundFromPixels(data, 3, 3, MAGENTA_KEY_COLOR)

    assert.equal(data[3], 0)
    assert.equal(data[center + 3], 255)
  })

  test('reports no transparent output for an ordinary opaque image', () => {
    const data = pixels(3, 3, [180, 170, 150])

    removeKeyedBackgroundFromPixels(data, 3, 3, GREEN_KEY_COLOR)

    assert.equal(transparentPixelRatio(data), 0)
  })
})
