import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const filePath = resolve(
  __dirname,
  '../src/features/keys/components/api-keys-mutate-drawer.tsx'
)
const source = readFileSync(filePath, 'utf8')

const footerMatch = source.match(
  /<SheetFooter[\s\S]*?<\/SheetFooter>/
)

if (!footerMatch) {
  throw new Error('Could not find the API key drawer footer.')
}

const saveButtonMatch = footerMatch[0].match(
  /<Button\s+([\s\S]*?)>\s*\{isSubmitting\s*\?\s*t\('Saving\.\.\.'\)\s*:\s*t\('Save changes'\)\}\s*<\/Button>/
)

if (!saveButtonMatch) {
  throw new Error('Could not find the API key save button.')
}

const saveButtonProps = saveButtonMatch[1]

if (!/type='button'/.test(saveButtonProps)) {
  throw new Error('API key save button must use direct click submission.')
}

if (/form='api-key-form'/.test(saveButtonProps)) {
  throw new Error('API key save button should not rely on portal form linkage.')
}

if (!/onClick=\{form\.handleSubmit\(onSubmit,\s*onInvalid\)\}/.test(saveButtonProps)) {
  throw new Error(
    'API key save button must submit directly and surface validation errors.'
  )
}
