import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { describe, test } from 'node:test'
import { buildCCSwitchURL } from './cc-switch.ts'

describe('buildCCSwitchURL', () => {
  test('includes a NewAPI token usage script for CC Switch balance query', () => {
    const url = buildCCSwitchURL({
      app: 'claude',
      name: 'My Claude',
      models: { model: 'claude-sonnet-4-5' },
      apiKey: 'sk-test',
      serverAddress: 'https://newapi.example.com',
    })

    const parsed = new URL(url)
    assert.equal(parsed.protocol, 'ccswitch:')
    assert.equal(parsed.searchParams.get('usageEnabled'), 'true')
    assert.equal(
      parsed.searchParams.get('usageBaseUrl'),
      'https://newapi.example.com'
    )
    assert.equal(parsed.searchParams.get('usageAutoInterval'), '5')

    const script = Buffer.from(
      parsed.searchParams.get('usageScript') ?? '',
      'base64'
    ).toString('utf8')
    assert.match(script, /\/api\/usage\/token\//)
    assert.match(script, /Authorization": "Bearer {{apiKey}}"/)
  })

  test('uses /v1 only for the provider endpoint of Codex imports', () => {
    const url = buildCCSwitchURL({
      app: 'codex',
      name: 'My Codex',
      models: { model: 'gpt-5-codex' },
      apiKey: 'sk-test',
      serverAddress: 'https://newapi.example.com',
    })

    const parsed = new URL(url)
    assert.equal(
      parsed.searchParams.get('endpoint'),
      'https://newapi.example.com/v1'
    )
    assert.equal(
      parsed.searchParams.get('usageBaseUrl'),
      'https://newapi.example.com'
    )
  })
})
