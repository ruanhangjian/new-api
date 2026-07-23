import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { formatGeneratingElapsedTime } from './generating-card'

const NOW = Date.UTC(2026, 6, 24, 2, 0, 0)
const NOW_SECONDS = Math.floor(NOW / 1000)

describe('formatGeneratingElapsedTime', () => {
  test('shows just now for a newly submitted task', () => {
    assert.equal(formatGeneratingElapsedTime(NOW_SECONDS - 20, NOW), '刚刚')
  })

  test('shows elapsed minutes and hours for a long-running task', () => {
    assert.equal(
      formatGeneratingElapsedTime(NOW_SECONDS - 8 * 60, NOW),
      '8 分钟前'
    )
    assert.equal(
      formatGeneratingElapsedTime(NOW_SECONDS - 14 * 60 * 60, NOW),
      '14 小时前'
    )
  })
})
