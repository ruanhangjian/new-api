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
import { useEffect, useRef } from 'react'
import { ArrowUp, Image, LoaderCircle, Video } from 'lucide-react'
import { toast } from 'sonner'
import type { ImageWorkshopModelCapability, ImageWorkshopToken } from '../types'

export type WorkshopFormState = {
  prompt: string
  tokenId: number
  model: string
  size: string
  quality: string
  outputFormat: string
  count: number
}

type WorkshopComposerProps = {
  value: WorkshopFormState
  tokens: ImageWorkshopToken[]
  capability?: ImageWorkshopModelCapability
  capabilities: ImageWorkshopModelCapability[]
  isLoading: boolean
  isSubmitting: boolean
  onChange: (next: Partial<WorkshopFormState>) => void
  onSubmit: () => void
}

function optionLabel(value: string) {
  const labels: Record<string, string> = {
    auto: '自动',
    low: '低',
    medium: '中',
    high: '高',
    standard: '标准',
    hd: '高清',
  }
  return labels[value] || value.toUpperCase()
}

export function WorkshopComposer({
  value,
  tokens,
  capability,
  capabilities,
  isLoading,
  isSubmitting,
  onChange,
  onSubmit,
}: WorkshopComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 360)}px`
    textarea.style.overflowY = textarea.scrollHeight > 360 ? 'auto' : 'hidden'
  }, [value.prompt])

  const disabled =
    isLoading ||
    isSubmitting ||
    !value.prompt.trim() ||
    !value.tokenId ||
    !value.model ||
    !capability

  return (
    <section
      className='image-workshop-composer-wrap'
      aria-labelledby='workshop-title'
    >
      <div className='image-workshop-composer-head'>
        <h1 id='workshop-title'>图片</h1>
        <div className='image-workshop-mode-switch' aria-label='创作类型'>
          <button className='is-active' type='button' aria-pressed='true'>
            <Image aria-hidden='true' />
            图片
          </button>
          <button
            type='button'
            aria-pressed='false'
            onClick={() => toast.info('视频功能暂未开放')}
          >
            <Video aria-hidden='true' />
            视频
          </button>
        </div>
      </div>

      <div className='image-workshop-composer'>
        <textarea
          ref={textareaRef}
          className='image-workshop-prompt'
          value={value.prompt}
          maxLength={32000}
          rows={1}
          placeholder='描述你想创作的画面...'
          aria-label='图片提示词'
          onChange={(event) => onChange({ prompt: event.target.value })}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              if (!disabled) onSubmit()
            }
          }}
        />

        <div className='image-workshop-parameter-grid'>
          <label>
            <span>令牌</span>
            <select
              value={value.tokenId || ''}
              disabled={!tokens.length}
              onChange={(event) =>
                onChange({ tokenId: Number(event.target.value) })
              }
            >
              {!tokens.length && <option value=''>暂无可用令牌</option>}
              {tokens.map((token) => (
                <option key={token.id} value={token.id}>
                  {token.name || `令牌 ${token.id}`} · {token.key}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>尺寸</span>
            <select
              value={value.size}
              disabled={!capability?.sizes.length}
              onChange={(event) => onChange({ size: event.target.value })}
            >
              {(capability?.sizes || []).map((size) => (
                <option key={size} value={size}>
                  {optionLabel(size)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>质量</span>
            <select
              value={value.quality}
              disabled={!capability?.qualities.length}
              onChange={(event) => onChange({ quality: event.target.value })}
            >
              {(capability?.qualities || []).map((quality) => (
                <option key={quality} value={quality}>
                  {optionLabel(quality)}
                </option>
              ))}
            </select>
          </label>

          {Boolean(capability?.output_formats.length) && (
            <label>
              <span>格式</span>
              <select
                value={value.outputFormat}
                onChange={(event) =>
                  onChange({ outputFormat: event.target.value })
                }
              >
                {capability?.output_formats.map((format) => (
                  <option key={format} value={format}>
                    {format.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span>数量</span>
            <select
              value={value.count}
              disabled={!capability}
              onChange={(event) =>
                onChange({ count: Number(event.target.value) })
              }
            >
              {Array.from(
                { length: capability?.max_images || 1 },
                (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1} 张
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        <div className='image-workshop-composer-bottom'>
          <label className='image-workshop-model-control'>
            <span className='sr-only'>模型</span>
            <select
              value={value.model}
              disabled={!capabilities.length}
              onChange={(event) => onChange({ model: event.target.value })}
            >
              {!capabilities.length && (
                <option value=''>暂无可用生图模型</option>
              )}
              {capabilities.map((item) => (
                <option key={item.model} value={item.model}>
                  {item.model}
                </option>
              ))}
            </select>
          </label>

          <button
            className='image-workshop-generate'
            type='button'
            disabled={disabled}
            aria-label={isSubmitting ? '正在提交' : '生成图片'}
            title={isSubmitting ? '正在提交' : '生成图片'}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <LoaderCircle className='animate-spin' aria-hidden='true' />
            ) : (
              <ArrowUp aria-hidden='true' />
            )}
          </button>
        </div>
      </div>
    </section>
  )
}
