import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

describe('affiliate rebate share copy', () => {
  test('keeps dedicated Chinese share templates instead of relying on runtime translation fallback', () => {
    assert.match(source, /const SHARE_COPY_TEMPLATES = \{/) 
    assert.match(source, /zhCN:\s*\[/)
    assert.match(
      source,
      /'我在用智链AI做模型中转，接入很方便，模型不掺水，日常用下来也比较稳定。邀请链接：\{\{link\}\}'/
    )
    assert.match(source, /const localeTemplates = isChineseLanguage/) 
    assert.doesNotMatch(source, /SHARE_COPY_KEYS\.map\(\(key\) => t\(key, \{ link: inviteLink \}\)\)/)
  })
})
