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
    'purchase dialog imports quota display formatter',
    /import \{ formatQuota \} from '@\/lib\/format'/,
  ],
  [
    'purchase dialog formats total quota instead of rendering raw units',
    /totalAmount > 0 \? formatQuota\(totalAmount\) : t\('Unlimited'\)/,
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
