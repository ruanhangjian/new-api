import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildImageWorkshopGenerationPayload,
  extractImageWorkshopResultImages,
  isImageWorkshopTaskTerminal,
} from './utils'

describe('isImageWorkshopTaskTerminal', () => {
  test('treats completed and failed statuses as terminal only', () => {
    assert.equal(isImageWorkshopTaskTerminal('queued'), false)
    assert.equal(isImageWorkshopTaskTerminal('running'), false)
    assert.equal(isImageWorkshopTaskTerminal('completed'), true)
    assert.equal(isImageWorkshopTaskTerminal('failed'), true)
  })
})

describe('extractImageWorkshopResultImages', () => {
  test('extracts signed URLs and data URLs from OpenAI image result data', () => {
    const images = extractImageWorkshopResultImages({
      created: 1783076036,
      data: [
        {
          url: '/v1/images/tasks/task_1/files/imgfile_0?expires=1&signature=s',
          revised_prompt: 'A quiet studio',
        },
        {
          b64_json: 'iVBORw0KGgo=',
        },
        {},
      ],
    })

    assert.deepEqual(images, [
      {
        src: '/v1/images/tasks/task_1/files/imgfile_0?expires=1&signature=s',
        revisedPrompt: 'A quiet studio',
      },
      {
        src: 'data:image/png;base64,iVBORw0KGgo=',
        revisedPrompt: '',
      },
    ])
  })

  test('returns no images for empty malformed or missing results', () => {
    assert.deepEqual(extractImageWorkshopResultImages(null), [])
    assert.deepEqual(extractImageWorkshopResultImages('not json'), [])
    assert.deepEqual(
      extractImageWorkshopResultImages({ data: 'bad' } as never),
      []
    )
  })
})

describe('buildImageWorkshopGenerationPayload', () => {
  test('builds the bridge payload with trimmed prompt model and numeric count', () => {
    assert.deepEqual(
      buildImageWorkshopGenerationPayload({
        tokenId: 12,
        prompt: '  neon skyline  ',
        model: ' gpt-image-1 ',
        size: '1024x1024',
        quality: 'auto',
        count: '2',
      }),
      {
        token_id: 12,
        prompt: 'neon skyline',
        model: 'gpt-image-1',
        size: '1024x1024',
        quality: 'auto',
        n: 2,
      }
    )
  })

  test('clamps invalid count to one image', () => {
    assert.equal(
      buildImageWorkshopGenerationPayload({
        tokenId: 1,
        prompt: 'draw',
        model: 'gpt-image-1',
        size: '1024x1024',
        quality: 'auto',
        count: '0',
      }).n,
      1
    )
  })
})
