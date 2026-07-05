import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

const currentDir = dirname(fileURLToPath(import.meta.url))
const pageSource = () => readFileSync(join(currentDir, 'index.tsx'), 'utf8')

describe('enterprise CDK create form state', () => {
  test('opens with empty amount and count inputs', () => {
    const source = pageSource()

    assert.match(source, /quota:\s*''/)
    assert.match(source, /count:\s*''/)
  })

  test('keeps count as input text instead of coercing empty input to zero', () => {
    assert.doesNotMatch(pageSource(), /count:\s*Number\(event\.target\.value\)/)
  })
})
