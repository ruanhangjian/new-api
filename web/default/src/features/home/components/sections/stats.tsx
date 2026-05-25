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
import { useTranslation } from 'react-i18next'
import { AnimateInView } from '@/components/animate-in-view'
import { cn } from '@/lib/utils'
import { API_SERVICE_STATS } from '../../constants'

interface StatsProps {
  className?: string
}

interface AnimatedStatValueProps {
  value: string
}

function parseStatValue(input: string): { target: number; suffix: string } {
  const suffixMatch = input.match(/[^\d.,]+$/)
  const suffix = suffixMatch ? suffixMatch[0] : ''
  const numericPart = input.replace(/[^\d.,]/g, '').replace(/,/g, '')

  const target = Number.parseFloat(numericPart)
  return {
    target: Number.isFinite(target) ? target : 0,
    suffix,
  }
}

function AnimatedStatValue({ value }: AnimatedStatValueProps) {
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )
  const [displayState, setDisplayState] = useState<{
    value: string
    text: string
  } | null>(null)
  const animatedValueRef = useRef<string | null>(null)

  useEffect(() => {
    if (prefersReducedMotion || animatedValueRef.current === value) {
      return
    }

    const { target, suffix } = parseStatValue(value)
    if (!target) {
      animatedValueRef.current = value
      return
    }

    const durationMs = 900
    const start = performance.now()
    let rafId = 0

    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1)
      const eased = 1 - (1 - progress) ** 3
      const current = target * eased
      const decimals = target % 1 !== 0 ? 1 : 0
      const formatted = current.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })

      setDisplayState({ value, text: `${formatted}${suffix}` })

      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        setDisplayState({ value, text: value })
        animatedValueRef.current = value
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [prefersReducedMotion, value])

  const display = displayState?.value === value ? displayState.text : value

  return <>{display}</>
}

export function Stats(_props: StatsProps) {
  const { t } = useTranslation()

  return (
    <div className='relative z-10 px-4 md:px-6'>
      <AnimateInView
        animation='scale-in'
        className='border-border bg-border mx-auto grid max-w-[1180px] grid-cols-2 gap-px overflow-hidden rounded-3xl border shadow-[0_18px_50px_rgba(15,23,42,0.06)] md:grid-cols-4'
      >
        {API_SERVICE_STATS.map((stat) => {
          const isLongValue = stat.value.length > 10

          return (
            <div
              key={stat.description}
              className='bg-card/85 px-5 py-6 text-center backdrop-blur-sm md:py-7'
            >
              <span
                className={cn(
                  'block leading-none font-bold tracking-tight',
                  isLongValue
                    ? 'text-2xl md:text-[28px]'
                    : 'text-3xl md:text-[34px]'
                )}
              >
                <AnimatedStatValue value={stat.value} />
              </span>
              <span className='text-muted-foreground mt-2 block text-sm font-medium'>
                {t(stat.description)}
              </span>
            </div>
          )
        })}
      </AnimateInView>
    </div>
  )
}
