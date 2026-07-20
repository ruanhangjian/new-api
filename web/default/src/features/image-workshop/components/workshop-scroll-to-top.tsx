import { ArrowUp } from 'lucide-react'
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
import { useEffect, useState, type RefObject } from 'react'

import { cn } from '@/lib/utils'

const SCROLL_TOP_VISIBILITY_THRESHOLD = 320

type WorkshopScrollToTopProps = {
  containerRef: RefObject<HTMLDivElement | null>
}

export function WorkshopScrollToTop({
  containerRef,
}: WorkshopScrollToTopProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateVisibility = () => {
      setIsVisible(container.scrollTop >= SCROLL_TOP_VISIBILITY_THRESHOLD)
    }

    updateVisibility()
    container.addEventListener('scroll', updateVisibility, { passive: true })
    return () => container.removeEventListener('scroll', updateVisibility)
  }, [containerRef])

  return (
    <button
      className={cn(
        'image-workshop-scroll-top',
        isVisible && 'image-workshop-scroll-top-visible'
      )}
      type='button'
      title='回到顶部'
      aria-label='回到顶部'
      aria-hidden={!isVisible}
      tabIndex={isVisible ? 0 : -1}
      onClick={() =>
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }
    >
      <ArrowUp aria-hidden='true' />
    </button>
  )
}
