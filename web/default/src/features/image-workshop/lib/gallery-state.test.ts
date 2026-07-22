import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { ImageWorkshopTask } from '../types'
import { hasAllTaskImagesLocally } from './gallery-state'

function completedTask(
  overrides: Partial<ImageWorkshopTask> = {}
): ImageWorkshopTask {
  return {
    task_id: 'task-two-images',
    status: 'completed',
    progress: '100%',
    n: 2,
    output_sizes: ['941x1672', '941x1672'],
    submit_time: 1,
    result_available: false,
    ...overrides,
  }
}

describe('hasAllTaskImagesLocally', () => {
  test('recognizes an expired two-image task when both local copies exist', () => {
    assert.equal(
      hasAllTaskImagesLocally(
        completedTask(),
        new Set(['task-two-images:0', 'task-two-images:1'])
      ),
      true
    )
  })

  test('keeps the expired state when one local copy is missing', () => {
    assert.equal(
      hasAllTaskImagesLocally(completedTask(), new Set(['task-two-images:0'])),
      false
    )
  })

  test('uses actual output count before requested count for partial results', () => {
    assert.equal(
      hasAllTaskImagesLocally(
        completedTask({ output_sizes: ['941x1672'] }),
        new Set(['task-two-images:0'])
      ),
      true
    )
  })
})
