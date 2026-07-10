import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { SYSTEM_SETTINGS_CONTENT_CLASS } from './index'

describe('system settings layout', () => {
  test('allows long settings sections to scroll inside the main content area', () => {
    assert.match(SYSTEM_SETTINGS_CONTENT_CLASS, /overflow-auto/)
  })
})
