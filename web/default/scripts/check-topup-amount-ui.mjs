import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const filePath = resolve(
  __dirname,
  '../src/features/wallet/components/recharge-form-card.tsx'
)
const formatPath = resolve(__dirname, '../src/features/wallet/lib/format.ts')
const zhLocalePath = resolve(__dirname, '../src/i18n/locales/zh.json')
const source = readFileSync(filePath, 'utf8')
const formatSource = readFileSync(formatPath, 'utf8')
const zhLocale = readFileSync(zhLocalePath, 'utf8')

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
  [
    'discount badge is positioned as a top-right corner badge',
    /absolute right-1\.5 top-1\.5[\s\S]*getDiscountLabel\(discount\)/,
  ],
  [
    'preset amount text is not truncated by the discount badge',
    /className='text-base leading-tight font-semibold sm:text-lg'[\s\S]*\{formatTopupAmount\(displayValue\)\}/,
  ],
  [
    'preset payment summary stays on one compact line',
    /className='[^']*flex-nowrap[\s\S]*className='[^']*whitespace-nowrap[\s\S]*\{t\('Pay'\)\} \{formatPaymentAmount\(actualPrice\)\}/,
  ],
  [
    'preset discount savings use contextual instant-save copy',
    /\{t\('Instant save'\)\} \{formatPaymentAmount\(savedAmount\)\}/,
  ],
  [
    'discount label uses Chinese fold wording instead of OFF',
    /return `\$\{label\}折`/,
  ],
]

const failures = expectations
  .filter(([description, pattern]) => {
    const targetSource = description.includes('discount label')
      ? formatSource
      : source
    return !pattern.test(targetSource)
  })
  .map(([description]) => description)

if (/\{t\('Save'\)\} \{formatPaymentAmount\(savedAmount\)\}/.test(source)) {
  failures.push('preset discount savings must not use the generic Save label')
}

if (/•\s*\{t\('Instant save'\)\}/.test(source)) {
  failures.push('preset discount savings must not include a leading bullet')
}

if (/return `\$\{off\}% OFF`/.test(formatSource)) {
  failures.push('discount label must not use OFF wording')
}

if (!/"Instant save":\s*"立省"/.test(zhLocale)) {
  failures.push('Chinese instant-save translation uses 立省')
}

if (failures.length > 0) {
  throw new Error(
    `Topup amount UI checks failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`
  )
}
