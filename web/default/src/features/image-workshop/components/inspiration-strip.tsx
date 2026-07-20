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
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'

import type { InspirationCase } from '../types'
import { ImagePreviewDialog } from './image-preview-dialog'
import { InspirationImage } from './inspiration-image'

type InspirationStripProps = {
  items: InspirationCase[]
  isLoading: boolean
  isSwitching: boolean
  onUse: (item: InspirationCase) => void
  onPrevious: () => void
  onNext: () => void
  onRandom: () => void
}

export function InspirationStrip({
  items,
  isLoading,
  isSwitching,
  onUse,
  onPrevious,
  onNext,
  onRandom,
}: InspirationStripProps) {
  return (
    <section
      className='image-workshop-inspiration'
      aria-labelledby='inspiration-title'
    >
      <div className='image-workshop-section-head'>
        <div className='image-workshop-section-title'>
          <h2 id='inspiration-title'>灵感模板</h2>
          <span>点击模板即可填入提示词</span>
        </div>
        <div className='image-workshop-section-actions'>
          <Link
            className='image-workshop-text-link'
            to='/image-workshop/library'
          >
            查看全部
            <ArrowUpRight aria-hidden='true' />
          </Link>
          <button
            type='button'
            title='上一批'
            aria-label='上一批'
            disabled={isLoading || isSwitching}
            onClick={onPrevious}
          >
            <ChevronLeft aria-hidden='true' />
          </button>
          <button
            type='button'
            title='下一批'
            aria-label='下一批'
            disabled={isLoading || isSwitching}
            onClick={onNext}
          >
            <ChevronRight aria-hidden='true' />
          </button>
        </div>
      </div>

      <div className='image-workshop-inspiration-grid' aria-busy={isLoading}>
        {isLoading
          ? Array.from({ length: 5 }, (_, index) => (
              <div className='image-workshop-template-skeleton' key={index} />
            ))
          : items.map((item) => (
              <article className='image-workshop-template-card' key={item.id}>
                <button
                  className='image-workshop-template-use'
                  type='button'
                  onClick={() => onUse(item)}
                >
                  {item.thumbnailUrl ? (
                    <InspirationImage
                      src={item.thumbnailUrl}
                      fallbackSrc={item.thumbnailFallbackUrl}
                      alt={item.title}
                      loading='eager'
                    />
                  ) : (
                    <span className='image-workshop-template-placeholder' />
                  )}
                  <span>{item.title}</span>
                </button>
                <ImagePreviewDialog
                  src={item.thumbnailUrl}
                  fallbackSrc={item.thumbnailFallbackUrl}
                  alt={item.title}
                />
              </article>
            ))}
      </div>

      <div className='image-workshop-template-footer'>
        <button
          type='button'
          title='换一批'
          aria-label='换一批'
          disabled={isLoading || isSwitching}
          onClick={onRandom}
        >
          <RefreshCw
            className={isSwitching ? 'animate-spin' : undefined}
            aria-hidden='true'
          />
        </button>
      </div>
    </section>
  )
}
