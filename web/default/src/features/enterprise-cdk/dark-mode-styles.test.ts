import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

const currentDir = dirname(fileURLToPath(import.meta.url))

describe('enterprise CDK dark mode styles', () => {
  test('primary dark buttons use theme foreground text', () => {
    const sourceFiles = [
      join(currentDir, 'index.tsx'),
      join(currentDir, '../enterprise-cdk-admin/index.tsx'),
    ]
    const offenders = sourceFiles.flatMap((filePath) =>
      readFileSync(filePath, 'utf8')
        .split('\n')
        .map((line, index) => ({ filePath, line, lineNumber: index + 1 }))
        .filter(
          ({ line }) =>
            line.includes('dark:bg-primary') &&
            line.includes('text-white') &&
            !line.includes('dark:text-primary-foreground')
        )
    )

    assert.deepEqual(
      offenders.map(
        ({ filePath, lineNumber }) => `${filePath}:${lineNumber}`
      ),
      []
    )
  })
})
