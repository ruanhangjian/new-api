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
import { useState } from 'react'
import { Eye, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { InspirationImage } from './inspiration-image'

type ImagePreviewDialogProps = {
  src?: string
  fallbackSrc?: string
  alt: string
  className?: string
}

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const SCALE_STEP = 0.25

export function ImagePreviewDialog({
  src,
  fallbackSrc,
  alt,
  className,
}: ImagePreviewDialogProps) {
  const [open, setOpen] = useState(false)
  const [scale, setScale] = useState(1)

  if (!src) return null

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) setScale(1)
  }

  return (
    <>
      <button
        className={className || 'image-workshop-preview-button'}
        type='button'
        title='查看原图'
        aria-label={`查看原图：${alt}`}
        onClick={(event) => {
          event.stopPropagation()
          changeOpen(true)
        }}
      >
        <Eye aria-hidden='true' />
      </button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          showCloseButton={false}
          className='image-workshop-preview-dialog'
        >
          <DialogTitle className='sr-only'>{alt}</DialogTitle>
          <div
            className='image-workshop-preview-viewport'
            onClick={(event) => {
              if (event.target === event.currentTarget) changeOpen(false)
            }}
          >
            <div
              className='image-workshop-preview-canvas'
              style={{
                width: `${Math.max(1, scale) * 100}%`,
                height: `${Math.max(1, scale) * 100}%`,
              }}
              onClick={(event) => {
                if (event.target === event.currentTarget) changeOpen(false)
              }}
            >
              <InspirationImage
                src={src}
                fallbackSrc={fallbackSrc}
                alt={alt}
                style={{
                  maxWidth: `${100 / Math.max(1, scale)}%`,
                  maxHeight: `${100 / Math.max(1, scale)}%`,
                  transform: `scale(${scale})`,
                }}
              />
            </div>
          </div>
          <div className='image-workshop-preview-toolbar'>
            <button
              type='button'
              title='缩小'
              aria-label='缩小图片'
              disabled={scale <= MIN_SCALE}
              onClick={() =>
                setScale((current) => Math.max(MIN_SCALE, current - SCALE_STEP))
              }
            >
              <ZoomOut aria-hidden='true' />
            </button>
            <span>{Math.round(scale * 100)}%</span>
            <button
              type='button'
              title='放大'
              aria-label='放大图片'
              disabled={scale >= MAX_SCALE}
              onClick={() =>
                setScale((current) => Math.min(MAX_SCALE, current + SCALE_STEP))
              }
            >
              <ZoomIn aria-hidden='true' />
            </button>
            <button
              type='button'
              title='适合窗口'
              aria-label='恢复适合窗口大小'
              onClick={() => setScale(1)}
            >
              <Maximize2 aria-hidden='true' />
            </button>
            <button
              type='button'
              title='关闭'
              aria-label='关闭原图'
              onClick={() => changeOpen(false)}
            >
              <X aria-hidden='true' />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
