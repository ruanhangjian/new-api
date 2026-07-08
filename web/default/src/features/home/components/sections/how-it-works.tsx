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
import { QUICK_START_STEPS } from '../../constants'
import { SectionHeading } from '../section-heading'

export function HowItWorks() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-4 pt-20 md:px-6 md:pt-24'>
      <div className='mx-auto max-w-[1180px]'>
        <AnimateInView>
          <SectionHeading title='从注册到稳定调用，仅需三步' />
        </AnimateInView>

        <div className='grid gap-4 md:grid-cols-3'>
          {QUICK_START_STEPS.map((step, i) => (
            <AnimateInView
              key={step.num}
              delay={i * 100}
              animation='fade-up'
              className='border-border/80 bg-card/85 relative min-h-[168px] overflow-hidden rounded-3xl border p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1'
            >
              <strong className='block text-[38px] leading-none font-black text-blue-600/18 dark:text-blue-400/20'>
                {step.num}
              </strong>
              <h3 className='mt-4 text-lg font-bold'>{t(step.title)}</h3>
              <p className='text-muted-foreground mt-2.5 text-sm leading-7'>
                {t(step.description)}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
