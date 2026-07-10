import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import zh from './locales/zh.json'

const translations = zh.translation as Record<string, string>

describe('custom Chinese translations', () => {
  test('keeps affiliate rebate sidebar badge wording aligned with the custom version', () => {
    assert.equal(translations['Lifetime {{rate}} Rebate'], '永久返利{{rate}}')
  })

  test('translates custom sidebar entries instead of falling back to English', () => {
    const keys = [
      'Channel Status',
      'Channel Monitor',
      'Channel Balances',
      'Enterprise CDK',
      'Enterprise CDK Management',
    ]

    for (const key of keys) {
      assert.ok(translations[key], `${key} should have a Chinese translation`)
      assert.notEqual(translations[key], key)
    }
  })

  test('translates affiliate rebate settings labels', () => {
    const keys = [
      'Affiliate Rebate',
      'Configure continuous invitation rebate settlement',
      'Enable affiliate rebate',
      'Rebate rate',
      'Daily rebate cap quota',
      'Minimum settlement quota',
      'Settlement hour',
      'Settlement start time',
      'Enable affiliate rebate gray rollout',
      'Affiliate rebate whitelist user IDs',
      'Save affiliate rebate settings',
    ]

    for (const key of keys) {
      assert.ok(translations[key], `${key} should have a Chinese translation`)
      assert.notEqual(translations[key], key)
    }
  })

  test('translates custom user-facing feature pages', () => {
    const expected = {
      'Earn continuous rebate from invited users': '邀请用户，持续获得返利',
      'Settlement Rules': '结算规则',
      'No channel status': '暂无渠道状态',
      'Enabled channel monitors will appear here.':
        '启用的渠道监控会显示在这里。',
      'More Services': '更多服务',
      'Quick Recharge': '快速充值',
      'View subscription and recharge records': '查看订阅与充值记录',
      'Channel Balances': '渠道余额',
      'Monitor upstream account balances and low-balance email alerts':
        '监控上游账户余额和低余额邮件告警',
    }

    for (const [key, value] of Object.entries(expected)) {
      assert.equal(translations[key], value)
    }
  })

  test('translates channel monitor status labels used by the upgraded frontend', () => {
    const expected = {
      Operational: '正常',
      Degraded: '降级',
      'Add monitor': '添加监控',
      'Not checked': '未检测',
      'Header name "{{name}}" cannot contain spaces or colon.':
        '请求头名称 "{{name}}" 不能包含空格或冒号。',
      'Body JSON': '请求体 JSON',
      'Filter by name or key...': '按名称或密钥筛选...',
      Tokens: '令牌',
    }

    for (const [key, value] of Object.entries(expected)) {
      assert.equal(translations[key], value)
    }
  })

  test('translates profile remark settings used by enterprise CDK', () => {
    const expected = {
      'Account Remark': '账户备注',
      'Enterprise CDK redemption records will show this remark first. Leave it empty to show email or username.':
        '企业 CDK 兑换记录会优先显示该备注，留空则显示邮箱或用户名。',
      'Example: Zhang San / Marketing - Li Lei':
        '示例：张三 / 市场部 - 李雷',
      'Save Remark': '保存备注',
      'Remark saved successfully': '备注保存成功',
      'Failed to save remark': '保存备注失败',
      'Please use WeChat\'s "Scan QR Code" feature to complete the binding process.':
        '请使用微信的“扫一扫”功能完成绑定。',
    }

    for (const [key, value] of Object.entries(expected)) {
      assert.equal(translations[key], value)
    }
  })
})
