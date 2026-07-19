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
import { WorkshopSelect } from './workshop-select'

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

function groupLabel(group: string) {
  if (!group || group === 'default') return '默认分组'
  if (group === 'auto') return '自动分组'
  return group
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
        <div className='image-workshop-key-picker'>
          <strong id='workshop-title'>选择 Key，直接开始创作</strong>
          <WorkshopSelect
            value={value.tokenId ? String(value.tokenId) : ''}
            options={tokens.map((token) => ({
              value: String(token.id),
              label: `${token.name || `Key ${token.id}`}-${groupLabel(token.group)}-${token.key}`,
            }))}
            placeholder='暂无可用 Key'
            ariaLabel='选择 Key'
            disabled={!tokens.length}
            className='image-workshop-key-select'
            contentClassName='image-workshop-key-select-content'
            onChange={(tokenId) => onChange({ tokenId: Number(tokenId) })}
          />
        </div>
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
          <div className='image-workshop-parameter-field'>
            <span>尺寸</span>
            <WorkshopSelect
              value={value.size}
              options={(capability?.sizes || []).map((size) => ({
                value: size,
                label: optionLabel(size),
              }))}
              placeholder='暂无可用尺寸'
              ariaLabel='尺寸'
              disabled={!capability?.sizes.length}
              onChange={(size) => onChange({ size })}
            />
          </div>

          <div className='image-workshop-parameter-field'>
            <span>质量</span>
            <WorkshopSelect
              value={value.quality}
              options={(capability?.qualities || []).map((quality) => ({
                value: quality,
                label: optionLabel(quality),
              }))}
              placeholder='暂无可用质量'
              ariaLabel='质量'
              disabled={!capability?.qualities.length}
              onChange={(quality) => onChange({ quality })}
            />
          </div>

          <div className='image-workshop-parameter-field'>
            <span>格式</span>
            <WorkshopSelect
              value={value.outputFormat || 'auto'}
              options={
                capability?.output_formats.length
                  ? capability.output_formats.map((format) => ({
                      value: format,
                      label: format.toUpperCase(),
                    }))
                  : [{ value: 'auto', label: '由模型决定' }]
              }
              ariaLabel='格式'
              disabled={!capability?.output_formats.length}
              onChange={(outputFormat) => onChange({ outputFormat })}
            />
          </div>

          <div className='image-workshop-parameter-field'>
            <span>透明背景</span>
            <WorkshopSelect
              value='false'
              options={[
                { value: 'false', label: '关闭' },
                ...(capability?.supports_transparent_background
                  ? [{ value: 'true', label: '开启' }]
                  : []),
              ]}
              ariaLabel='透明背景'
              disabled={!capability?.supports_transparent_background}
              onChange={() => {}}
            />
          </div>

          <label className='image-workshop-parameter-field'>
            <span>数量</span>
            <input
              type='number'
              min={1}
              max={capability?.max_images || 1}
              value={value.count}
              disabled={!capability}
              onChange={(event) =>
                onChange({
                  count: Math.min(
                    capability?.max_images || 1,
                    Math.max(1, Number(event.target.value) || 1)
                  ),
                })
              }
            />
          </label>
        </div>

        <div className='image-workshop-composer-bottom'>
          <WorkshopSelect
            value={value.model}
            options={capabilities.map((item) => ({
              value: item.model,
              label: item.model,
            }))}
            placeholder='暂无可用生图模型'
            ariaLabel='模型'
            disabled={!capabilities.length}
            className='image-workshop-model-select'
            onChange={(model) => onChange({ model })}
          />

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
