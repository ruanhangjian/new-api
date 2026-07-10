import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const tableSource = readFileSync(
  new URL('./components/usage-logs-table.tsx', import.meta.url),
  'utf8'
)
const commonColumnsSource = readFileSync(
  new URL('./components/columns/common-logs-columns.tsx', import.meta.url),
  'utf8'
)

describe('usage logs table layout', () => {
  test('does not force desktop header widths that create unnecessary horizontal scroll', () => {
    assert.doesNotMatch(tableSource, /\bapplyHeaderSize\b/)
  })

  test('localizes the tokens column header', () => {
    assert.doesNotMatch(commonColumnsSource, /header:\s*'Tokens'/)
    assert.match(commonColumnsSource, /header:\s*t\('Tokens'\)/)
  })
})
