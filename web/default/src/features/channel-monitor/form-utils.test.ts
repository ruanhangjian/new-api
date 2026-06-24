import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  filterActiveMonitorApiKeys,
  formatMonitorTokenDisplay,
  getInvalidMonitorHeaderName,
  monitorHeaderRowsToJSON,
  monitorHeadersToRows,
  normalizeMonitorTokenKey,
  splitMonitorModels,
} from './form-utils'

describe('splitMonitorModels', () => {
  test('splits newline comma and semicolon separated models with stable de-duplication', () => {
    assert.deepEqual(
      splitMonitorModels('claude-sonnet-4\ngpt-5-mini, gemini-2.5;gpt-5-mini'),
      ['claude-sonnet-4', 'gpt-5-mini', 'gemini-2.5']
    )
  })
})

describe('filterActiveMonitorApiKeys', () => {
  test('keeps enabled non-expired keys and matches search by name key or group', () => {
    const keys = [
      {
        id: 1,
        name: 'Claude key',
        key: 'sk-abc',
        group: 'anthropic',
        status: 1,
        expired_time: -1,
      },
      {
        id: 2,
        name: 'Expired key',
        key: 'sk-expired',
        group: 'openai',
        status: 1,
        expired_time: 100,
      },
      {
        id: 3,
        name: 'Disabled key',
        key: 'sk-disabled',
        group: 'gemini',
        status: 2,
        expired_time: -1,
      },
    ]

    assert.deepEqual(
      filterActiveMonitorApiKeys(keys, 'anth', 200).map((key) => key.id),
      [1]
    )
  })
})

describe('normalizeMonitorTokenKey', () => {
  test('adds sk prefix when the token endpoint returns a bare key', () => {
    assert.equal(normalizeMonitorTokenKey('abc123'), 'sk-abc123')
    assert.equal(normalizeMonitorTokenKey('sk-abc123'), 'sk-abc123')
    assert.equal(formatMonitorTokenDisplay('masked'), 'sk-masked')
    assert.equal(formatMonitorTokenDisplay('sk-masked'), 'sk-masked')
  })
})

describe('monitor header row helpers', () => {
  test('converts header JSON to editable rows and back to JSON', () => {
    const rows = monitorHeadersToRows(
      '{"User-Agent":"claude-cli/1.0.83","anthropic-beta":"claude-code-20250219"}'
    )

    assert.deepEqual(rows, [
      { name: 'User-Agent', value: 'claude-cli/1.0.83' },
      { name: 'anthropic-beta', value: 'claude-code-20250219' },
    ])
    assert.equal(
      monitorHeaderRowsToJSON([...rows, { name: '', value: 'ignored' }]),
      '{\n  "User-Agent": "claude-cli/1.0.83",\n  "anthropic-beta": "claude-code-20250219"\n}'
    )
  })

  test('flags clearly invalid header names', () => {
    assert.equal(
      getInvalidMonitorHeaderName([
        { name: 'bad header', value: 'x' },
        { name: 'ok-header', value: 'y' },
      ]),
      'bad header'
    )
    assert.equal(
      getInvalidMonitorHeaderName([{ name: 'ok-header', value: 'y' }]),
      ''
    )
  })
})
