import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  channelBalancePageRefreshMs,
  getChannelBalanceActiveRefreshMs,
  getChannelBalancePageRefreshMs,
} from './auto-refresh.ts'

describe('getChannelBalancePageRefreshMs', () => {
  test('disables page polling when saved auto refresh is off', () => {
    assert.equal(getChannelBalancePageRefreshMs(0), 0)
  })

  test('polls the current page every minute when saved auto refresh is on', () => {
    assert.equal(getChannelBalancePageRefreshMs(1), channelBalancePageRefreshMs)
    assert.equal(getChannelBalancePageRefreshMs(30), channelBalancePageRefreshMs)
  })
})

describe('getChannelBalanceActiveRefreshMs', () => {
  test('disables active refresh when saved auto refresh is off', () => {
    assert.equal(getChannelBalanceActiveRefreshMs(0), 0)
  })

  test('uses the saved minute interval for active balance refresh', () => {
    assert.equal(getChannelBalanceActiveRefreshMs(1), 60 * 1000)
    assert.equal(getChannelBalanceActiveRefreshMs(5), 5 * 60 * 1000)
  })
})
