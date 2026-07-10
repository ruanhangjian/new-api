import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const tableSource = readFileSync(
  new URL('./components/api-keys-table.tsx', import.meta.url),
  'utf8'
)

describe('API keys table layout', () => {
  test('keeps the custom fork single search field layout', () => {
    assert.match(tableSource, /searchPlaceholder:\s*t\('Filter by name or key\.\.\.'\)/)
    assert.doesNotMatch(tableSource, /additionalSearch/)
  })

  test('does not force desktop header widths that create excessive horizontal scroll', () => {
    assert.doesNotMatch(tableSource, /\bapplyHeaderSize\b/)
  })
})
