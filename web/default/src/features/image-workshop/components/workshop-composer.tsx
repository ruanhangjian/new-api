import {
  ArrowUp,
  Image,
  Images,
  LoaderCircle,
  Plus,
  Video,
  X,
} from 'lucide-react'
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
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { ImageWorkshopModelCapability, ImageWorkshopToken } from '../types'
import { ImageSizePicker } from './image-size-picker'
import { WorkshopSelect } from './workshop-select'

export type WorkshopFormState = {
  prompt: string
  tokenId: number
  model: string
  size: string
  quality: string
  outputFormat: string
  count: number
  referenceImages: File[]
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

function referenceFileKey(file: File) {
  return `${file.name}-${file.type}-${file.size}-${file.lastModified}`
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

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDraggingReferences, setIsDraggingReferences] = useState(false)
  const supportsReferences = Boolean(capability?.supports_reference_images)
  const maxReferenceImages = Math.min(capability?.max_reference_images || 9, 9)

  const referencePreviews = useMemo(
    () =>
      value.referenceImages.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [value.referenceImages]
  )

  useEffect(() => {
    return () => {
      referencePreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [referencePreviews])

  function addReferenceImages(files: File[]) {
    if (!files.length) return
    if (!supportsReferences) {
      toast.warning('当前模型不支持上传参考图')
      return
    }

    const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
    const validFiles = files.filter((file) => supportedTypes.has(file.type))
    const unsupportedCount = files.length - validFiles.length
    if (unsupportedCount > 0) {
      toast.warning(
        `有 ${unsupportedCount} 张图片格式不支持，仅支持 PNG、JPEG 和 WEBP`
      )
    }

    const sizeValidFiles = validFiles.filter((file) => file.size <= 20 << 20)
    const oversizedCount = validFiles.length - sizeValidFiles.length
    if (oversizedCount > 0) {
      toast.warning(`有 ${oversizedCount} 张图片超过 20 MB，未添加`)
    }

    const knownFiles = new Set(value.referenceImages.map(referenceFileKey))
    const uniqueFiles = sizeValidFiles.filter((file) => {
      const key = referenceFileKey(file)
      if (knownFiles.has(key)) {
        return false
      }
      knownFiles.add(key)
      return true
    })
    const duplicateCount = sizeValidFiles.length - uniqueFiles.length
    if (duplicateCount > 0) {
      toast.info(`有 ${duplicateCount} 张重复图片未再次添加`)
    }

    const available = Math.max(
      0,
      maxReferenceImages - value.referenceImages.length
    )
    const withinCountLimit = uniqueFiles.slice(0, available)
    const countOverflow = uniqueFiles.length - withinCountLimit.length
    const currentBytes = value.referenceImages.reduce(
      (total, file) => total + file.size,
      0
    )
    let nextBytes = currentBytes
    const added = withinCountLimit.filter((file) => {
      if (nextBytes + file.size > 100 << 20) return false
      nextBytes += file.size
      return true
    })
    const totalSizeOverflow = withinCountLimit.length - added.length

    if (added.length) {
      onChange({ referenceImages: [...value.referenceImages, ...added] })
    }
    if (countOverflow > 0) {
      toast.warning(
        `最多上传 ${maxReferenceImages} 张参考图，已添加 ${added.length} 张，其余 ${countOverflow + totalSizeOverflow} 张未添加`
      )
    } else if (totalSizeOverflow > 0) {
      toast.warning('参考图总大小不能超过 100 MB，超出部分未添加')
    }
  }

  function removeReferenceImage(index: number) {
    onChange({
      referenceImages: value.referenceImages.filter(
        (_file, fileIndex) => fileIndex !== index
      ),
    })
  }

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

      <div
        className={`image-workshop-composer${isDraggingReferences ? ' is-dragging-references' : ''}`}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes('Files')) {
            return
          }
          event.preventDefault()
          setIsDraggingReferences(true)
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) {
            return
          }
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            return
          }
          setIsDraggingReferences(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsDraggingReferences(false)
          addReferenceImages([...event.dataTransfer.files])
        }}
      >
        <textarea
          ref={textareaRef}
          className='image-workshop-prompt'
          value={value.prompt}
          maxLength={32000}
          rows={1}
          placeholder='描述你想创作的画面...'
          aria-label='图片提示词'
          onChange={(event) => onChange({ prompt: event.target.value })}
          onPaste={(event) => {
            const images = [...event.clipboardData.files].filter((file) =>
              file.type.startsWith('image/')
            )
            if (!images.length) {
              return
            }
            event.preventDefault()
            addReferenceImages(images)
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              if (!disabled) {
                onSubmit()
              }
            }
          }}
        />

        {value.referenceImages.length > 0 && (
          <div className='image-workshop-reference-strip'>
            <div className='image-workshop-reference-list'>
              {referencePreviews.map(({ file, url }, index) => (
                <div
                  className='image-workshop-reference-preview'
                  key={referenceFileKey(file)}
                >
                  <img src={url} alt={`参考图 ${index + 1}`} />
                  <button
                    type='button'
                    aria-label={`删除参考图 ${index + 1}`}
                    title='删除参考图'
                    onClick={() => removeReferenceImage(index)}
                  >
                    <X aria-hidden='true' />
                  </button>
                </div>
              ))}
              {value.referenceImages.length < maxReferenceImages && (
                <button
                  className='image-workshop-reference-add-tile'
                  type='button'
                  aria-label='继续添加参考图'
                  title='继续添加参考图'
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus aria-hidden='true' />
                </button>
              )}
            </div>
            <span>
              {value.referenceImages.length}/{maxReferenceImages}
            </span>
          </div>
        )}

        <div className='image-workshop-parameter-grid'>
          <div className='image-workshop-parameter-field'>
            <span>尺寸</span>
            {capability ? (
              <ImageSizePicker
                value={value.size}
                capability={capability}
                onChange={(size) => onChange({ size })}
              />
            ) : (
              <button
                type='button'
                className='image-workshop-size-trigger'
                disabled
              >
                <span className='image-workshop-size-trigger-value'>
                  暂无可用尺寸
                </span>
              </button>
            )}
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

          <div className='image-workshop-parameter-field'>
            <span>数量</span>
            <WorkshopSelect
              value={String(value.count)}
              options={Array.from(
                { length: Math.min(capability?.max_images || 1, 6) },
                (_, index) => {
                  const count = index + 1
                  return { value: String(count), label: `${count} 张` }
                }
              )}
              ariaLabel='数量'
              disabled={!capability}
              onChange={(count) => onChange({ count: Number(count) })}
            />
          </div>
        </div>

        <div className='image-workshop-composer-bottom'>
          <div className='image-workshop-composer-tools'>
            <input
              ref={fileInputRef}
              className='image-workshop-reference-input'
              type='file'
              accept='.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'
              multiple
              onChange={(event) => {
                addReferenceImages([...(event.target.files || [])])
                event.target.value = ''
              }}
            />
            <button
              className='image-workshop-reference-trigger'
              type='button'
              disabled={
                !supportsReferences ||
                value.referenceImages.length >= maxReferenceImages
              }
              title={supportsReferences ? '上传参考图' : '当前模型不支持参考图'}
              onClick={() => fileInputRef.current?.click()}
            >
              <Images aria-hidden='true' />
              <span>参考图</span>
              {value.referenceImages.length > 0 && (
                <small>{value.referenceImages.length}</small>
              )}
            </button>
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
          </div>

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
