import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const walletSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

describe('wallet subscription purchase balance flow', () => {
  test('passes the current wallet quota into subscription plan cards', () => {
    assert.match(
      walletSource,
      /const subscriptionUserQuota = Number\(user\?\.quota \|\| 0\)/
    )

    const matches = walletSource.match(/userQuota=\{subscriptionUserQuota\}/g)
    assert.ok(matches && matches.length >= 3)
  })
})
