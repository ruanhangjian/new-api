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
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

function getPrefersReducedMotion() {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface AnimateInViewProps {
  children: ReactNode
  className?: string
  delay?: number
  threshold?: number
  animation?: 'fade-up' | 'fade-in' | 'scale-in' | 'fade-left' | 'fade-right'
  once?: boolean
  as?: 'div' | 'section' | 'li' | 'span'
}

export function AnimateInView(props: AnimateInViewProps) {
  const {
    as: Tag = 'div',
    delay = 0,
    threshold = 0.15,
    animation = 'fade-up',
    once = true,
  } = props

  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(() => getPrefersReducedMotion())
  const [isAnimating, setIsAnimating] = useState(false)
  const hasEnteredRef = useRef(isVisible)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) {
      hasEnteredRef.current = true
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (once && hasEnteredRef.current) return
          hasEnteredRef.current = true
          setIsVisible(true)
          setIsAnimating(true)
          if (once) observer.unobserve(el)
        } else if (!once) {
          setIsVisible(false)
          setIsAnimating(false)
          hasEnteredRef.current = false
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, once, animation])

  return (
    <Tag
      ref={ref as never}
      className={cn(
        'will-change-[transform,opacity]',
        isVisible ? 'opacity-100' : 'opacity-0',
        isAnimating ? `landing-animate-${animation}` : undefined,
        props.className
      )}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return
        setIsAnimating(false)
      }}
      style={{ animationDelay: delay ? `${delay}ms` : undefined }}
    >
      {props.children}
    </Tag>
  )
}
