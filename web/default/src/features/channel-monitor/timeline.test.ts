import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ChannelMonitorTimelinePoint } from './types'
import { buildTimelineBars } from './utils'

function point(
  status: ChannelMonitorTimelinePoint['status'],
  checkedAt: number
): ChannelMonitorTimelinePoint {
  return {
    status,
    latency_ms: 120,
    ping_latency_ms: 40,
    checked_at: checkedAt,
  }
}

describe('buildTimelineBars', () => {
  test('pads left side and keeps newest point on the right', () => {
    const bars = buildTimelineBars([
      point('operational', 300),
      point('failed', 200),
      point('degraded', 100),
    ])

    assert.equal(bars.length, 60)
    assert.equal(bars[0]?.status, 'empty')
    assert.equal(bars[56]?.status, 'empty')
    assert.equal(bars[57]?.status, 'degraded')
    assert.equal(bars[58]?.status, 'failed')
    assert.equal(bars[59]?.status, 'operational')
  })

  test('encodes status by height and color class', () => {
    const bars = buildTimelineBars([
      point('operational', 400),
      point('degraded', 300),
      point('failed', 200),
      point('error', 100),
    ])

    assert.deepEqual(bars.slice(-4).map((bar) => bar.heightPercent), [
      35, 35, 65, 100,
    ])
    assert.deepEqual(bars.slice(-4).map((bar) => bar.className), [
      'bg-red-500',
      'bg-red-500',
      'bg-amber-500',
      'bg-emerald-500',
    ])
  })
})
