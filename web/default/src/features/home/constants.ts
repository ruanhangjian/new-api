/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/**
 * Home page constants
 * All hardcoded data for home page sections
 */
import { type TFunction } from 'i18next'

// Layout - Main base classes
export const MAIN_BASE_CLASSES = 'bg-background text-foreground w-full'

export type HomepageActionStatus = 'linked' | 'missing'

export interface HomepageAction {
  label: string
  status: HomepageActionStatus
  route?: '/sign-up' | '/dashboard' | '/pricing'
  href?: string
  external?: boolean
}

export interface QuickStartStep {
  num: string
  title: string
  description: string
}

export interface AppIntegration {
  name: string
  logo: string
  description: string
  logoClassName?: string
}

export interface ValueReason {
  marker: string
  tone: 'blue' | 'green' | 'amber' | 'violet'
  title: string
  description: string
  proof: {
    label: string
    value: string
    good?: boolean
  }[]
}

export interface UserReview {
  quote: string
  name: string
  role: string
  avatar: string
}

export const HOMEPAGE_ACTIONS: HomepageAction[] = [
  {
    label: '立即开始',
    status: 'linked',
    route: '/sign-up',
  },
  {
    label: '查看价格',
    status: 'linked',
    route: '/pricing',
  },
  {
    label: '查看接入教程',
    status: 'linked',
    href: '/docs',
  },
  {
    label: '加入 QQ 交流群',
    status: 'missing',
  },
  {
    label: '查看 API 文档',
    status: 'missing',
  },
] as const

export const HERO_ABILITY_CARDS = [
  {
    name: 'ChatGPT',
    description: '聊天 / 写作',
    logo: '/home/logos/openai.svg',
  },
  {
    name: 'Codex',
    description: '代码生成',
    logo: '/home/logos/codex.svg',
  },
  {
    name: 'image-2',
    description: '图像生成',
    logo: '',
  },
] as const

export const HERO_CHIPS = [
  'ChatGPT / Codex / 图像生成',
  '透明 Token 计费',
  '数据加密处理',
] as const

export const API_SERVICE_STATS = [
  {
    value: '10,0000+',
    description: '每日 API 请求',
  },
  {
    value: '99.9%',
    description: '服务可用率',
  },
  {
    value: '20+',
    description: 'OpenAI 模型与能力',
  },
  {
    value: '1,000,000,000+',
    description: '每日 Token 数',
  },
] as const

export const VALUE_REASONS: ValueReason[] = [
  {
    marker: '1',
    tone: 'blue',
    title: '使用便捷',
    description:
      '保留原有 OpenAI SDK 与应用配置习惯，替换地址和令牌即可开始调用。',
    proof: [
      { label: 'OpenAI SDK', value: '直接调用', good: true },
      { label: '聊天/绘画应用', value: '替换地址', good: true },
    ],
  },
  {
    marker: '¥',
    tone: 'green',
    title: '透明计费，不玩倍率虚标',
    description:
      '按 Token 记录用量，模型价格与调用明细清晰可查，避免隐藏倍率和叠加计费。',
    proof: [
      { label: '倍率虚标', value: '不采用' },
      { label: '模型表价格', value: '公开透明', good: true },
    ],
  },
  {
    marker: '↯',
    tone: 'amber',
    title: '高质量资源池，优先调度',
    description: '智能调度资源池，避免高峰期排队、模型降智和异常波动。',
    proof: [
      { label: '稳定调用', value: '优先保障', good: true },
      { label: '异常波动', value: '减少影响', good: true },
    ],
  },
  {
    marker: '锁',
    tone: 'violet',
    title: '数据安全，加密处理',
    description: '令牌隔离、传输加密、日志可追踪，降低密钥暴露和滥用风险。',
    proof: [
      { label: '令牌隔离', value: '支持', good: true },
      { label: '传输加密', value: '支持', good: true },
    ],
  },
]

export const QUICK_START_STEPS: QuickStartStep[] = [
  {
    num: '01',
    title: '注册账号，创建 API Key',
    description:
      '进入工作台生成专属 API Key。不同项目可分开创建，后续停用、限流和成本归因都更清楚。',
  },
  {
    num: '02',
    title: '替换 Base URL',
    description:
      '在 ChatGPT、Codex 或支持自定义 API 的应用里填入本站地址和 API Key，原有 OpenAI 调用方式保持不变。',
  },
  {
    num: '03',
    title: '开始使用，按需查用量',
    description:
      '调用后可随时查看请求状态、Token 消耗和异常信息，账单更透明，排查也更快。',
  },
]

export const APP_INTEGRATIONS: AppIntegration[] = [
  {
    name: 'Claude Code',
    logo: '/home/logos/claude.svg',
    description: '通过供应商配置接入 Claude / Anthropic 兼容服务。',
  },
  {
    name: 'Codex',
    logo: '/home/logos/openai.svg',
    description: '支持配置 API Key、模型与兼容端点。',
  },
  {
    name: 'Gemini CLI',
    logo: '/home/logos/gemini.svg',
    description: '适合命令行开发场景的模型与供应商切换。',
  },
  {
    name: 'OpenCode',
    logo: '/home/logos/opencode-official.svg',
    description: '支持 OpenAI 兼容提供商与自定义模型配置。',
  },
  {
    name: 'Cursor',
    logo: '/home/logos/cursor.svg',
    description: 'AI 代码编辑器，可配置 OpenAI 兼容端点与 API Key。',
  },
  {
    name: 'Cherry Studio',
    logo: '/home/logos/cherrystudio.svg',
    description: '桌面 AI 客户端，支持自定义 OpenAI 兼容提供商。',
  },
  {
    name: 'OpenClaw',
    logo: '/home/logos/openclaw-official.svg',
    description: 'Agent 开发工具，可接入自定义模型供应商。',
  },
  {
    name: 'Hermes',
    logo: '/home/logos/hermes.png',
    description: '面向 Agent 场景的客户端，支持自定义提供商配置。',
    logoClassName: 'scale-110',
  },
]

export const USER_REVIEWS: UserReview[] = [
  {
    quote:
      '我们最看重稳定性和输出速度。接入后 API 调用很稳，Token 输出明显更快，不像有些平台慢到影响开发节奏。用满血 gpt-5.5 写代码和改 Bug，质量确实很强。天才程序员上线！',
    name: '陈工',
    role: 'A厂程序员',
    avatar: '陈',
  },
  {
    quote:
      '我日常用 GPT 写 PRD、出原型图和梳理业务逻辑，整体可用性很高。平台计费也透明，用量和日志都能对上，不偷跑不虚跑，对我工作提效帮助很大。',
    name: '周老师',
    role: '某中厂产品经理',
    avatar: '周',
  },
  {
    quote:
      '我平时用 Codex 和 OpenClaw 跑文案、封面图和视频剪辑。接入这个平台后效率提升非常明显。整体价格便宜，而且长时间跑任务也非常稳定。',
    name: '阿凯',
    role: '自媒体UP主',
    avatar: '凯',
  },
]

// Hero section - AI Applications (Left side)
export const AI_APPLICATIONS = [
  'LobeHub.Color',
  'Dify.Color',
  'OpenWebUI',
  'Cline',
] as const

// Hero section - AI Models (Right side)
export const AI_MODELS = [
  'Qwen.Color',
  'DeepSeek.Color',
  'Doubao.Color',
  'OpenAI',
  'Claude.Color',
  'Gemini.Color',
] as const

// Hero section - Gateway Features
export const GATEWAY_FEATURES = [
  'Cost Tracking',
  'Model Access',
  'Guardrails',
  'Observability',
  'Budgets',
  'Load Balancing',
  'Rate Limiting',
  'Token Mgmt',
  'Prompt Caching',
  'Pass-Through',
] as const

// Stats section - Default statistics
export const DEFAULT_STATS = [
  {
    value: '50',
    suffix: '+',
    description: 'upstream services integrated',
  },
  {
    value: '100',
    suffix: '+',
    description: 'model billing support',
  },
  {
    value: '50',
    suffix: '+',
    description: 'compatible API routes',
  },
  {
    value: '10',
    suffix: '+',
    description: 'scheduling controls',
  },
] as const

// Features section - Default features
export const DEFAULT_FEATURES = [
  {
    title: 'Lightning Fast',
    description:
      'Optimized network architecture ensures millisecond response times',
    iconName: 'Zap',
  },
  {
    title: 'Secure & Reliable',
    description:
      'Enterprise-grade security with comprehensive permission management',
    iconName: 'Shield',
  },
  {
    title: 'Global Coverage',
    description: 'Multi-region deployment for stable global access',
    iconName: 'Globe',
  },
  {
    title: 'Developer Friendly',
    description: 'Compatible API routes for common AI application workflows',
    iconName: 'Code',
  },
  {
    title: 'High Performance',
    description: 'Support for high concurrency with automatic load balancing',
    iconName: 'Gauge',
  },
  {
    title: 'Transparent Billing',
    description: 'Pay-as-you-go with real-time usage monitoring',
    iconName: 'DollarSign',
  },
  {
    title: 'Team Collaboration',
    description: 'Multi-user management with flexible permission allocation',
    iconName: 'Users',
  },
  {
    title: 'Open Source',
    description: 'Community driven, self-hosted, and extensible',
    iconName: 'HeartHandshake',
  },
] as const

export function getGatewayFeatures(t: TFunction) {
  return GATEWAY_FEATURES.map((feature) => t(feature))
}

export function getDefaultStats(t: TFunction) {
  return DEFAULT_STATS.map((stat) => ({
    ...stat,
    description: stat.description ? t(stat.description) : undefined,
  }))
}

export function getDefaultFeatures(t: TFunction) {
  return DEFAULT_FEATURES.map((feature) => ({
    ...feature,
    title: t(feature.title),
    description: t(feature.description),
  }))
}
