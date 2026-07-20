import {
  Check,
  ChevronDown,
  Info,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  Square,
} from 'lucide-react'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import {
  calculateImageSize,
  findImageSizePreset,
  imageBillingTierForSize,
  imageSizeSummary,
  isImageWorkshopSizeSupported,
  normalizeImageSize,
  parseImageRatio,
  parseImageSize,
  type ImageSizeTier,
} from '../lib/image-size'
import type { ImageWorkshopModelCapability } from '../types'

type ImageSizePickerProps = {
  value: string
  capability: ImageWorkshopModelCapability
  onChange: (value: string) => void
}

type SizeMode = 'auto' | 'ratio' | 'resolution'

const SIZE_TIERS: ImageSizeTier[] = ['1K', '2K', '4K']
const RATIO_ICONS = {
  '1:1': Square,
  '3:2': RectangleHorizontal,
  '2:3': RectangleVertical,
  '16:9': RectangleHorizontal,
  '9:16': RectangleVertical,
  '4:3': RectangleHorizontal,
  '3:4': RectangleVertical,
  '21:9': RectangleHorizontal,
} as const

function tierHasSupportedRatio(
  capability: ImageWorkshopModelCapability,
  tier: ImageSizeTier
) {
  return (capability.aspect_ratios || []).some((ratio) => {
    const size = calculateImageSize(tier, ratio)
    return Boolean(size && isImageWorkshopSizeSupported(capability, size))
  })
}

function SizePickerPanel({
  value,
  capability,
  onChange,
  onClose,
}: ImageSizePickerProps & { onClose: () => void }) {
  const currentPreset = findImageSizePreset(value)
  const [mode, setMode] = useState<SizeMode>(() => {
    if (value === 'auto') return 'auto'
    if (currentPreset) return 'ratio'
    return 'resolution'
  })
  const [pendingValue, setPendingValue] = useState(value || 'auto')
  const [tier, setTier] = useState<ImageSizeTier>(currentPreset?.tier || '1K')
  const [ratio, setRatio] = useState<string>(currentPreset?.ratio || '1:1')
  const [customRatio, setCustomRatio] = useState('5:4')
  const parsedValue = parseImageSize(value)
  const [customWidth, setCustomWidth] = useState(
    String(parsedValue?.width || 1024)
  )
  const [customHeight, setCustomHeight] = useState(
    String(parsedValue?.height || 1024)
  )

  const options = capability.sizes
  const hasAuto = options.includes('auto')
  const ratios = capability.aspect_ratios || []
  const supportsCustomSize = Boolean(capability.supports_custom_size)

  const previewSize = useMemo(() => {
    if (mode === 'auto') return 'auto'
    if (mode === 'ratio') {
      const activeRatio = ratio === 'custom' ? customRatio : ratio
      return calculateImageSize(tier, activeRatio) || ''
    }
    const width = Number.parseInt(customWidth, 10)
    const height = Number.parseInt(customHeight, 10)
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return ''
    }
    return normalizeImageSize(`${width}x${height}`, capability.size_constraints)
  }, [
    capability.size_constraints,
    customHeight,
    customRatio,
    customWidth,
    mode,
    ratio,
    tier,
  ])

  const previewSupported = Boolean(
    previewSize && isImageWorkshopSizeSupported(capability, previewSize)
  )

  const billingTier = imageBillingTierForSize(previewSize || pendingValue)

  const apply = () => {
    if (!previewSize || !previewSupported) return
    onChange(previewSize)
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>设置图像尺寸</DialogTitle>
        <DialogDescription>
          当前：{imageSizeSummary(pendingValue)}
        </DialogDescription>
      </DialogHeader>

      <div className='image-workshop-size-panel'>
        <div
          className='image-workshop-size-tabs'
          role='tablist'
          aria-label='尺寸模式'
        >
          {hasAuto && (
            <button
              type='button'
              role='tab'
              aria-selected={mode === 'auto'}
              className={mode === 'auto' ? 'is-active' : ''}
              onClick={() => {
                setMode('auto')
                setPendingValue('auto')
              }}
            >
              自动
            </button>
          )}
          <button
            type='button'
            role='tab'
            aria-selected={mode === 'ratio'}
            className={mode === 'ratio' ? 'is-active' : ''}
            onClick={() => {
              if (mode === 'ratio') return
              setMode('ratio')
              setRatio('1:1')
              const nextSize = calculateImageSize(tier, '1:1')
              if (
                nextSize &&
                isImageWorkshopSizeSupported(capability, nextSize)
              ) {
                setPendingValue(nextSize)
              }
            }}
          >
            按比例
          </button>
          <button
            type='button'
            role='tab'
            aria-selected={mode === 'resolution'}
            className={mode === 'resolution' ? 'is-active' : ''}
            disabled={!supportsCustomSize}
            title={
              supportsCustomSize ? '自定义宽高' : '当前模型不支持自定义宽高'
            }
            onClick={() => setMode('resolution')}
          >
            自定义宽高
          </button>
        </div>

        <div className='image-workshop-size-panel-body'>
          {mode === 'auto' && (
            <div className='image-workshop-size-auto'>
              <span className='image-workshop-size-auto-icon'>
                <Sparkles aria-hidden='true' />
              </span>
              <strong>自动尺寸</strong>
              <p>不向模型传递具体分辨率参数，由模型根据内容决定输出尺寸。</p>
            </div>
          )}

          {mode === 'ratio' && (
            <div className='image-workshop-size-options'>
              <section>
                <div className='image-workshop-size-label'>基准分辨率</div>
                <div className='image-workshop-tier-list'>
                  {SIZE_TIERS.map((item) => {
                    const supported = Boolean(
                      capability.size_tiers?.includes(item) &&
                      tierHasSupportedRatio(capability, item)
                    )
                    return (
                      <button
                        key={item}
                        type='button'
                        disabled={!supported}
                        aria-pressed={tier === item}
                        className={[
                          supported ? 'is-supported' : 'is-disabled',
                          tier === item ? 'is-selected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        title={
                          supported ? `${item} 基准分辨率` : '当前模型不支持'
                        }
                        onClick={() => {
                          setTier(item)
                          const activeRatio =
                            ratio === 'custom' ? customRatio : ratio
                          const nextSize = calculateImageSize(item, activeRatio)
                          if (
                            nextSize &&
                            isImageWorkshopSizeSupported(capability, nextSize)
                          ) {
                            setPendingValue(nextSize)
                          }
                        }}
                      >
                        <span>{item}</span>
                        {!supported && <small>暂不支持</small>}
                      </button>
                    )
                  })}
                </div>
              </section>

              <section>
                <div className='image-workshop-size-label'>图像比例</div>
                <div className='image-workshop-ratio-grid'>
                  {ratios.map((item) => {
                    const size = calculateImageSize(tier, item)
                    const supported = Boolean(
                      size && isImageWorkshopSizeSupported(capability, size)
                    )
                    const selected = pendingValue === size
                    const Icon =
                      RATIO_ICONS[item as keyof typeof RATIO_ICONS] || Square
                    return (
                      <button
                        key={item}
                        type='button'
                        disabled={!supported}
                        aria-pressed={selected}
                        className={[
                          supported ? 'is-supported' : 'is-disabled',
                          selected ? 'is-selected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        title={
                          supported ? `${item} · ${size}` : '当前模型不支持'
                        }
                        onClick={() => {
                          if (size) {
                            setRatio(item)
                            setPendingValue(size)
                          }
                        }}
                      >
                        <Icon
                          className='image-workshop-ratio-icon'
                          aria-hidden='true'
                        />
                        <span>{item}</span>
                        {selected && (
                          <Check
                            className='image-workshop-size-check'
                            aria-hidden='true'
                          />
                        )}
                      </button>
                    )
                  })}
                  {supportsCustomSize && (
                    <button
                      type='button'
                      aria-pressed={ratio === 'custom'}
                      className={[
                        'image-workshop-ratio-custom is-supported',
                        ratio === 'custom' ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        setRatio('custom')
                        const nextSize = calculateImageSize(tier, customRatio)
                        setPendingValue(nextSize || '')
                      }}
                    >
                      自定义比例
                    </button>
                  )}
                </div>
                {ratio === 'custom' && supportsCustomSize && (
                  <label className='image-workshop-custom-ratio'>
                    <span>输入自定义比例</span>
                    <input
                      value={customRatio}
                      aria-invalid={!parseImageRatio(customRatio)}
                      placeholder='例如 5:4 / 2.39:1'
                      onChange={(event) => {
                        setCustomRatio(event.target.value)
                        const nextSize = calculateImageSize(
                          tier,
                          event.target.value
                        )
                        setPendingValue(nextSize || '')
                      }}
                    />
                  </label>
                )}
              </section>
            </div>
          )}

          {mode === 'resolution' && supportsCustomSize && (
            <div className='image-workshop-custom-size'>
              <div className='image-workshop-size-label'>输入具体像素值</div>
              <div className='image-workshop-custom-size-inputs'>
                <label>
                  <span>宽度</span>
                  <input
                    type='number'
                    min={16}
                    value={customWidth}
                    onChange={(event) => {
                      setCustomWidth(event.target.value)
                      setPendingValue('')
                    }}
                    placeholder='例如 2048'
                  />
                </label>
                <span className='image-workshop-custom-size-times'>×</span>
                <label>
                  <span>高度</span>
                  <input
                    type='number'
                    min={16}
                    value={customHeight}
                    onChange={(event) => {
                      setCustomHeight(event.target.value)
                      setPendingValue('')
                    }}
                    placeholder='例如 2048'
                  />
                </label>
              </div>
              <p className='image-workshop-size-hint'>
                最终尺寸会自动规整为 16 的倍数，最大边 3840px，宽高比不超过
                3:1，总像素范围为 655,360 - 8,294,400。
              </p>
            </div>
          )}

          {mode === 'resolution' && !supportsCustomSize && (
            <div className='image-workshop-size-auto'>
              <span className='image-workshop-size-auto-icon'>
                <Info aria-hidden='true' />
              </span>
              <strong>当前模型不支持自定义宽高</strong>
              <p>请在模型 capability 声明支持后使用该功能。</p>
            </div>
          )}
        </div>

        <div className='image-workshop-size-current'>
          <Info aria-hidden='true' />
          <div>
            <span>
              将使用：
              <strong>{imageSizeSummary(previewSize || pendingValue)}</strong>
            </span>
            {Boolean(capability.size_tiers?.length) && (
              <span>
                预计计费档位：<strong>{billingTier}</strong>
                <small>按实际请求尺寸判定</small>
              </span>
            )}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type='button' variant='outline' onClick={onClose}>
          取消
        </Button>
        <Button type='button' onClick={apply} disabled={!previewSupported}>
          应用尺寸
        </Button>
      </DialogFooter>
    </>
  )
}

export function ImageSizePicker(props: ImageSizePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button type='button' className='image-workshop-size-trigger' />
        }
        aria-label='尺寸'
      >
        <span className='image-workshop-size-trigger-value'>
          {imageSizeSummary(props.value)}
        </span>
        <ChevronDown aria-hidden='true' />
      </DialogTrigger>
      <DialogContent className='image-workshop-size-dialog' showCloseButton>
        <SizePickerPanel
          key={`${props.value}:${open ? 'open' : 'closed'}`}
          {...props}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
