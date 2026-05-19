import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sourceRoot = resolve(__dirname, '../src/features/subscriptions/lib')
const walletCardPath = resolve(
  __dirname,
  '../src/features/wallet/components/subscription-plans-card.tsx'
)
const purchaseDialogPath = resolve(
  __dirname,
  '../src/features/subscriptions/components/dialogs/subscription-purchase-dialog.tsx'
)

const formatSource = readFileSync(resolve(sourceRoot, 'format.ts'), 'utf8')
const indexSource = readFileSync(resolve(sourceRoot, 'index.ts'), 'utf8')
const walletSource = readFileSync(walletCardPath, 'utf8')
const purchaseSource = readFileSync(purchaseDialogPath, 'utf8')

const expectations = [
  {
    description: 'subscription formatter exposes displayed total quota helper',
    source: formatSource,
    pattern: /export function formatPlanDisplayTotalQuota\(/,
  },
  {
    description: 'duration day count supports monthly plans as 30-day months',
    source: formatSource,
    pattern: /if \(unit === 'month'\) return value \* 30/,
  },
  {
    description: 'daily reset display multiplies quota by duration days',
    source: formatSource,
    pattern: /displayTotal = formatPlanQuota\(totalAmount \* durationDays\)/,
  },
  {
    description: 'subscription quota formula disables large number abbreviation',
    source: formatSource,
    pattern: /formatQuotaWithCurrency\([\s\S]*abbreviate: false/,
  },
  {
    description: 'daily reset display uses requested formula format',
    source: formatSource,
    pattern: /`\$\{periodAmount\}\*\$\{durationDays\}\$\{t\('days'\)\}=\$\{displayTotal\}`/,
  },
  {
    description: 'subscription lib index exports displayed total quota helper',
    source: indexSource,
    pattern: /formatPlanDisplayTotalQuota/,
  },
  {
    description: 'wallet plan cards use displayed total quota helper',
    source: walletSource,
    pattern: /formatPlanDisplayTotalQuota\(plan, t\)/,
  },
  {
    description: 'purchase dialog uses displayed total quota helper',
    source: purchaseSource,
    pattern: /formatPlanDisplayTotalQuota\(plan, t\)/,
  },
  {
    description: 'wallet plan cards no longer render raw plan total quota as benefit',
    source: walletSource,
    pattern: /Total Quota'\)}: \$\{formatQuota\(totalAmount\)\}/,
    negate: true,
  },
  {
    description: 'purchase dialog no longer renders raw plan total quota',
    source: purchaseSource,
    pattern: /totalAmount > 0 \? formatQuota\(totalAmount\) : t\('Unlimited'\)/,
    negate: true,
  },
]

const failures = expectations
  .filter(({ source, pattern, negate }) => {
    const matched = pattern.test(source)
    return negate ? matched : !matched
  })
  .map(({ description }) => description)

if (failures.length > 0) {
  throw new Error(
    `Subscription user quota display checks failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`
  )
}

const runtimeSource = formatSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^import .*$/gm, '')
  .replace(/export /g, '')
  .replace(/: Partial<SubscriptionPlan>/g, '')
  .replace(/: TFunction/g, '')
  .replace(/: string/g, '')
  .replace(/: number/g, '')
  .replace(/const unitLabels: Record<string, string> =/g, 'const unitLabels =')

const sandbox = {
  dayjs: () => ({ format: () => '' }),
  formatQuotaWithCurrency: (quota) => `$${quota / 500000}`,
}
vm.createContext(sandbox)
vm.runInContext(`${runtimeSource}; this.formatPlanDisplayTotalQuota = formatPlanDisplayTotalQuota;`, sandbox)

const t = (key) => ({ days: '天', Unlimited: '无限制' })[key] || key
const quotaPerDollar = 500000
const examples = [
  {
    description: 'daily card without reset shows single quota',
    plan: {
      total_amount: 15 * quotaPerDollar,
      duration_unit: 'day',
      duration_value: 1,
      quota_reset_period: 'never',
    },
    expected: '$15',
  },
  {
    description: 'weekly daily-reset card shows daily quota multiplied by 7 days',
    plan: {
      total_amount: 80 * quotaPerDollar,
      duration_unit: 'day',
      duration_value: 7,
      quota_reset_period: 'daily',
    },
    expected: '$80*7天=$560',
  },
  {
    description: 'monthly daily-reset card shows daily quota multiplied by 30 days',
    plan: {
      total_amount: 70 * quotaPerDollar,
      duration_unit: 'month',
      duration_value: 1,
      quota_reset_period: 'daily',
    },
    expected: '$70*30天=$2100',
  },
]

const runtimeFailures = examples
  .map((example) => {
    const actual = sandbox.formatPlanDisplayTotalQuota(example.plan, t)
    return actual === example.expected
      ? null
      : `${example.description}: expected ${example.expected}, got ${actual}`
  })
  .filter(Boolean)

if (runtimeFailures.length > 0) {
  throw new Error(
    `Subscription user quota formula examples failed:\n${runtimeFailures
      .map((failure) => `- ${failure}`)
      .join('\n')}`
  )
}
