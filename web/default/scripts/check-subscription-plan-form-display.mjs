import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const libPath = resolve(
  __dirname,
  '../src/features/subscriptions/lib/plan-form.ts'
)
const drawerPath = resolve(
  __dirname,
  '../src/features/subscriptions/components/subscriptions-mutate-drawer.tsx'
)
const libSource = readFileSync(libPath, 'utf8')
const drawerSource = readFileSync(drawerPath, 'utf8')
const totalQuotaFieldMatch = drawerSource.match(
  /name='total_amount'[\s\S]*?\n\s*<FormField\s+control=\{form\.control\}\s+name='upgrade_group'/
)
const totalQuotaFieldSource = totalQuotaFieldMatch?.[0] || ''

const expectations = [
  [
    'form schema requires display quota amount to be at least 1',
    libSource,
    /total_amount: z\.coerce\.number\(\)\.min\(1,/,
  ],
  [
    'editing a plan converts raw quota to display amount',
    libSource,
    /total_amount: quotaUnitsToDollars\(Number\(plan\.total_amount \|\| 0\)\)/,
  ],
  [
    'submitting a plan converts display amount back to raw quota',
    libSource,
    /total_amount: parseQuotaFromDollars\(Number\(values\.total_amount \|\| 0\)\)/,
  ],
  [
    'new plans default to a positive display quota amount',
    libSource,
    /total_amount: 1,/,
  ],
  [
    'total quota label remains the normal total quota label',
    drawerSource,
    /<FormLabel>\{t\('Total Quota'\)\}<\/FormLabel>/,
  ],
  [
    'total quota input has a fixed dollar prefix',
    totalQuotaFieldSource,
    /<span[^>]*>\s*\$\s*<\/span>/,
  ],
  [
    'total quota input minimum is one',
    totalQuotaFieldSource,
    /min=\{1\}/,
  ],
  [
    'total quota field no longer shows the unlimited helper text',
    totalQuotaFieldSource,
    /[\s\S]+/,
    (match) => !match.includes("t('0 means unlimited')"),
  ],
  [
    'numeric inputs select their existing value on focus',
    drawerSource,
    /function selectNumberOnFocus[\s\S]*event\.currentTarget\.select\(\)/,
  ],
  [
    'total quota input selects the default value before typing',
    totalQuotaFieldSource,
    /onFocus=\{selectNumberOnFocus\}/,
  ],
]

const failures = expectations
  .filter(([, source, pattern, predicate]) => {
    const match = source.match(pattern)
    if (!match) return true
    return predicate ? !predicate(match[0]) : false
  })
  .map(([description]) => description)

if (failures.length > 0) {
  throw new Error(
    `Subscription plan form display checks failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`
  )
}
