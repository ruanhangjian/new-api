import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  filterSelectableOptions,
  type Option,
} from './multi-select'

describe('filterSelectableOptions', () => {
  const options: Option[] = [
    { label: 'gpt-5.4', value: 'gpt-5.4' },
    { label: 'gpt-5.5', value: 'gpt-5.5' },
    {
      label: 'gpt-5.1-codex-max-openai-compact',
      value: 'gpt-5.1-codex-max-openai-compact',
    },
  ]

  test('returns only matches for the current input', () => {
    const filtered = filterSelectableOptions(options, [], 'gpt-5.5')

    assert.deepEqual(filtered, [{ label: 'gpt-5.5', value: 'gpt-5.5' }])
  })

  test('excludes already selected options', () => {
    const filtered = filterSelectableOptions(options, ['gpt-5.5'], 'gpt-5')

    assert.deepEqual(filtered, [
      { label: 'gpt-5.4', value: 'gpt-5.4' },
      {
        label: 'gpt-5.1-codex-max-openai-compact',
        value: 'gpt-5.1-codex-max-openai-compact',
      },
    ])
  })
})
