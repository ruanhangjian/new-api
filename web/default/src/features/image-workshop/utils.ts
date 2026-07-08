/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type {
  ImageWorkshopGenerationInput,
  ImageWorkshopGenerationPayload,
  ImageWorkshopResult,
  ImageWorkshopResultImage,
  ImageWorkshopTask,
} from './types'

const terminalStatuses = new Set([
  'completed',
  'failed',
  'succeeded',
  'success',
  'cancelled',
  'canceled',
])

export function isImageWorkshopTaskTerminal(status: string): boolean {
  return terminalStatuses.has(status.toLowerCase())
}

export function buildImageWorkshopGenerationPayload(
  input: ImageWorkshopGenerationInput
): ImageWorkshopGenerationPayload {
  const parsedCount = Number.parseInt(input.count, 10)
  const n = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1

  return {
    token_id: input.tokenId,
    prompt: input.prompt.trim(),
    model: input.model.trim(),
    size: input.size,
    quality: input.quality,
    n: Math.min(n, 10),
  }
}

export function extractImageWorkshopResultImages(
  result: ImageWorkshopTask['result']
): ImageWorkshopResultImage[] {
  const parsed = parseImageWorkshopResult(result)
  if (!parsed || !Array.isArray(parsed.data)) {
    return []
  }

  return parsed.data.flatMap((item) => {
    if (typeof item?.url === 'string' && item.url.trim()) {
      return [
        {
          src: item.url,
          revisedPrompt: item.revised_prompt?.trim() ?? '',
        },
      ]
    }

    if (typeof item?.b64_json === 'string' && item.b64_json.trim()) {
      return [
        {
          src: `data:image/png;base64,${item.b64_json.trim()}`,
          revisedPrompt: item.revised_prompt?.trim() ?? '',
        },
      ]
    }

    return []
  })
}

function parseImageWorkshopResult(
  result: ImageWorkshopTask['result']
): ImageWorkshopResult | null {
  if (!result) {
    return null
  }
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result) as ImageWorkshopResult
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }
  return result
}
