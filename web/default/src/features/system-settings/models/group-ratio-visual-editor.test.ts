import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildGroupPricingRows,
  normalizeRatio,
  serializeGroupPricingRows,
} from './group-ratio-visual-editor'

describe('group pricing ratio inputs', () => {
  test('preserves decimal input intermediate states while editing', () => {
    assert.equal(normalizeRatio('0'), '0')
    assert.equal(normalizeRatio('0.'), '0.')
    assert.equal(normalizeRatio('0.0'), '0.0')
    assert.equal(normalizeRatio('0.08'), '0.08')
  })

  test('serializes edited decimal ratios as numbers', () => {
    const rows = buildGroupPricingRows(
      JSON.stringify({ discount: 0.1 }),
      JSON.stringify({ discount: 'limited promo' })
    )

    rows[0].ratio = '0.08'

    assert.deepEqual(JSON.parse(serializeGroupPricingRows(rows).GroupRatio), {
      discount: 0.08,
    })
  })
})
