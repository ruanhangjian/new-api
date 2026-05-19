import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const filePath = resolve(
  __dirname,
  '../src/features/subscriptions/components/dialogs/subscription-purchase-dialog.tsx'
)
const source = readFileSync(filePath, 'utf8')

const expectations = [
  [
    'purchase dialog imports subscription quota display formatter',
    /formatPlanDisplayTotalQuota/,
  ],
  [
    'purchase dialog uses subscription quota display helper instead of raw units',
    /formatPlanDisplayTotalQuota\(plan, t\)/,
  ],
]

const failures = expectations
  .filter(([, pattern]) => !pattern.test(source))
  .map(([description]) => description)

if (failures.length > 0) {
  throw new Error(
    `Subscription quota display checks failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`
  )
}
