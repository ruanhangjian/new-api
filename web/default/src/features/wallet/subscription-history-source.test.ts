import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const source = readFileSync(
  new URL('./components/subscription-plans-card.tsx', import.meta.url),
  'utf8'
)

describe('wallet subscription history source labels', () => {
  test('maps internal balance source to a localized user-facing label', () => {
    assert.match(source, /function getSubscriptionSourceLabel\(/)
    assert.match(source, /case 'balance':\s*return t\('Balance Payment'\)/)
    assert.doesNotMatch(source, /\{subscription\?\.source \|\| '-'/)
    assert.match(source, /getSubscriptionSourceLabel\(subscription\?\.source, t\)/)
  })
})
