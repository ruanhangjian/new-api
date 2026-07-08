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
import { useTranslation } from 'react-i18next'
import { AnimateInView } from '@/components/animate-in-view'
import { cn } from '@/lib/utils'
import { VALUE_REASONS } from '../../constants'
import { SectionHeading } from '../section-heading'

interface FeaturesProps {
  className?: string
}

export function Features(_props: FeaturesProps) {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-4 pt-20 md:px-6 md:pt-24'>
      <div className='mx-auto max-w-[1180px]'>
        <AnimateInView>
          <SectionHeading title='我们的优势' />
        </AnimateInView>

        <div className='grid gap-4 md:grid-cols-4 md:gap-[18px]'>
          {VALUE_REASONS.map((reason, i) => (
            <AnimateInView
              key={reason.title}
              delay={i * 80}
              animation='scale-in'
              className={cn(
                'border-border/80 bg-card/85 group flex min-h-[248px] flex-col rounded-3xl border p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(15,23,42,0.1)] md:p-[22px]',
                i === 0 &&
                  'bg-[linear-gradient(135deg,rgba(37,99,235,0.08),color-mix(in_oklch,var(--card)_90%,transparent)),var(--card)]'
              )}
            >
              <span
                className={cn(
                  'flex size-[46px] items-center justify-center rounded-2xl text-lg font-black',
                  reason.tone === 'blue' &&
                    'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
                  reason.tone === 'green' &&
                    'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
                  reason.tone === 'amber' &&
                    'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
                  reason.tone === 'violet' &&
                    'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300'
                )}
              >
                {reason.marker}
              </span>
              <h3 className='mt-5 text-lg font-bold'>{t(reason.title)}</h3>
              <p className='text-muted-foreground mt-3 text-sm leading-7'>
                {t(reason.description)}
              </p>
              <div className='mt-auto grid gap-2.5 pt-5'>
                {reason.proof.map((item) => {
                  const isNoMarkupRow = !item.good && item.value === '不采用'

                  return (
                    <div
                      key={item.label}
                      className={cn(
                        'bg-muted/55 text-muted-foreground flex justify-between gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold',
                        isNoMarkupRow &&
                          'dark:border dark:border-white/20 dark:bg-white/5',
                        item.good &&
                          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      )}
                    >
                      <span>{t(item.label)}</span>
                      <span
                        className={cn(
                          isNoMarkupRow
                            ? 'text-red-600 dark:text-red-400'
                            : undefined
                        )}
                      >
                        {t(item.value)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
