import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const source = readFileSync(
  new URL('./components/settings-page-context.tsx', import.meta.url),
  'utf8'
)

describe('system settings page actions', () => {
  test('localizes custom save and reset button text', () => {
    assert.match(source, /saveText\s*\?\s*t\(saveText\)\s*:/)
    assert.match(source, /resetText\s*\?\s*t\(resetText\)\s*:/)
  })
})
