import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  APP_INTEGRATIONS,
  HOMEPAGE_ACTIONS,
  QUICK_START_STEPS,
} from './constants'

describe('API service homepage content', () => {
  test('keeps the quick-start flow focused on the three promised steps', () => {
    assert.deepEqual(
      QUICK_START_STEPS.map((step) => step.title),
      ['注册账号，创建 API Key', '替换 Base URL', '开始使用，按需查用量']
    )
  })

  test('keeps OpenClaw and Hermes as the final app integrations', () => {
    assert.deepEqual(
      APP_INTEGRATIONS.slice(-2).map((app) => app.name),
      ['OpenClaw', 'Hermes']
    )
  })

  test('marks homepage actions without routes for follow-up decisions', () => {
    assert.deepEqual(
      HOMEPAGE_ACTIONS.filter((action) => action.status === 'missing').map(
        (action) => action.label
      ),
      ['加入 QQ 交流群', '查看 API 文档']
    )
  })
})
