import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const filePath = resolve(
  __dirname,
  '../src/features/wallet/components/recharge-form-card.tsx'
)
const source = readFileSync(filePath, 'utf8')

const expectations = [
  [
    'preset recharge amount uses a dollar prefix',
    /formatTopupAmount\(displayValue\)/,
  ],
  [
    'preset payment copy uses the localized Pay label and yen prefix',
    /\{t\('Pay'\)\} \{formatPaymentAmount\(actualPrice\)\}/,
  ],
  [
    'custom amount input shows a dollar-prefixed overlay',
    /<span[^>]*>\s*\$\s*<\/span>[\s\S]*value=\{localAmount\}/,
  ],
  [
    'custom amount label includes the dollar unit',
    /\{t\('Custom Amount \(\$\)'\)\}/,
  ],
  [
    'amount-to-pay value is rendered with yuan suffix',
    /formatYuanAmount\(paymentAmount\)/,
  ],
  [
    'amount-to-pay value is highlighted in red',
    /text-red-500/,
  ],
]

const failures = expectations
  .filter(([, pattern]) => !pattern.test(source))
  .map(([description]) => description)

if (failures.length > 0) {
  throw new Error(
    `Topup amount UI checks failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`
  )
}
