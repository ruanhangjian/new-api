import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  getImageWorkshopPollingInterval,
  getNextImageWorkshopRateLimitFailureCount,
  IMAGE_WORKSHOP_ACTIVE_POLL_INTERVAL_MS,
  IMAGE_WORKSHOP_IDLE_POLL_INTERVAL_MS,
  IMAGE_WORKSHOP_POLLING_REQUEST_CONFIG,
  IMAGE_WORKSHOP_RATE_LIMIT_BACKOFF_MS,
  isImageWorkshopPollingRateLimited,
} from './polling.ts'

describe('image workshop polling rate limit handling', () => {
  test('recognizes Axios-style and direct HTTP 429 errors', () => {
    assert.equal(
      isImageWorkshopPollingRateLimited({ response: { status: 429 } }),
      true
    )
    assert.equal(isImageWorkshopPollingRateLimited({ status: '429' }), true)
    assert.equal(
      isImageWorkshopPollingRateLimited({ response: { status: 503 } }),
      false
    )
    assert.equal(isImageWorkshopPollingRateLimited(new Error('429')), false)
  })

  test('keeps polling 429 errors out of global business and HTTP toasts', () => {
    assert.equal(IMAGE_WORKSHOP_POLLING_REQUEST_CONFIG.skipErrorHandler, true)
    assert.equal(IMAGE_WORKSHOP_POLLING_REQUEST_CONFIG.skipBusinessError, true)
  })

  test('backs off repeated 429 responses and caps the delay', () => {
    const error = { response: { status: 429 } }
    const intervals = [1, 2, 3, 4, 8].map((failureCount) =>
      getImageWorkshopPollingInterval({
        hasActiveTasks: true,
        error,
        failureCount,
      })
    )

    assert.deepEqual(intervals, [
      ...IMAGE_WORKSHOP_RATE_LIMIT_BACKOFF_MS,
      IMAGE_WORKSHOP_RATE_LIMIT_BACKOFF_MS.at(-1),
    ])
  })

  test('counts consecutive 429 responses and resets after recovery', () => {
    const rateLimitError = { response: { status: 429 } }
    let failureCount = getNextImageWorkshopRateLimitFailureCount(
      0,
      rateLimitError
    )
    failureCount = getNextImageWorkshopRateLimitFailureCount(
      failureCount,
      rateLimitError
    )
    assert.equal(failureCount, 2)

    assert.equal(
      getNextImageWorkshopRateLimitFailureCount(failureCount, null),
      0
    )
    assert.equal(
      getNextImageWorkshopRateLimitFailureCount(failureCount, {
        response: { status: 503 },
      }),
      0
    )
  })

  test('restores the normal interval after a successful request', () => {
    assert.equal(
      getImageWorkshopPollingInterval({
        hasActiveTasks: true,
        error: null,
        failureCount: 0,
      }),
      IMAGE_WORKSHOP_ACTIVE_POLL_INTERVAL_MS
    )
    assert.equal(
      getImageWorkshopPollingInterval({
        hasActiveTasks: false,
        error: null,
        failureCount: 0,
      }),
      IMAGE_WORKSHOP_IDLE_POLL_INTERVAL_MS
    )
  })
})
