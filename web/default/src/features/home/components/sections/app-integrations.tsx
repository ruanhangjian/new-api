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
import { APP_INTEGRATIONS } from '../../constants'
import { SectionHeading } from '../section-heading'

export function AppIntegrations() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-4 pt-20 md:px-6 md:pt-24'>
      <div className='mx-auto max-w-[1180px]'>
        <AnimateInView>
          <SectionHeading title='AI 应用与开发工具快速接入' />
        </AnimateInView>

        <div className='grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4'>
          {APP_INTEGRATIONS.map((app, i) => (
            <AnimateInView
              key={app.name}
              delay={i * 55}
              animation='fade-up'
              className='border-border/80 bg-card/85 flex min-h-[132px] flex-col justify-between rounded-[20px] border p-[18px] shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/30 hover:shadow-[0_22px_54px_rgba(15,23,42,0.1)]'
            >
              <div className='flex items-center gap-3'>
                <div className='border-border/80 flex size-[42px] items-center justify-center overflow-hidden rounded-2xl border bg-white dark:bg-white'>
                  <img
                    src={app.logo}
                    alt={t('{{name}} logo', { name: app.name })}
                    className={cn('size-[25px] object-contain', app.logoClassName)}
                  />
                </div>
                <strong className='text-[15px] font-bold'>{app.name}</strong>
              </div>
              <p className='text-muted-foreground mt-5 text-[13px] leading-6'>
                {t(app.description)}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
