import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  parseSidebarModulesAdmin,
  SIDEBAR_MODULES_DEFAULT,
} from './config'

describe('sidebar module defaults', () => {
  test('keeps image workshop enabled in the chat section by default', () => {
    assert.equal(SIDEBAR_MODULES_DEFAULT.chat.image_workshop, true)
    assert.equal(parseSidebarModulesAdmin('').chat.image_workshop, true)
  })
})
