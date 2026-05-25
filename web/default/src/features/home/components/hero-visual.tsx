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
import { ImageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { HERO_ABILITY_CARDS } from '../constants'

const abilityPositions = [
  'md:left-9 md:top-7',
  'md:left-1/2 md:top-7 md:-translate-x-1/2',
  'md:right-9 md:top-7',
] as const

export function HeroVisual() {
  const { t } = useTranslation()

  return (
    <div className='relative mx-auto w-full max-w-[560px] md:min-h-[520px]'>
      <div className='border-border/70 bg-card/90 relative grid gap-2 overflow-hidden rounded-3xl border p-3 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl md:absolute md:inset-[8px_0_0_0] md:block md:p-0 dark:shadow-[0_24px_70px_rgba(0,0,0,0.28)]'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 z-[2] h-24 bg-[linear-gradient(180deg,var(--card)_0%,color-mix(in_oklch,var(--card)_55%,transparent)_42%,transparent_100%)] opacity-55 md:h-24 dark:opacity-35'
        />

        <div className='grid grid-cols-3 gap-2 md:block'>
          {HERO_ABILITY_CARDS.map((ability, index) => (
            <div
              key={ability.name}
              className={cn(
                'border-border/80 bg-card/95 relative z-[4] flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-md md:absolute md:grid md:w-[130px] md:grid-cols-[30px_1fr] md:items-center md:justify-normal md:gap-2 md:px-3 md:py-2.5 md:text-left lg:w-[142px]',
                abilityPositions[index]
              )}
            >
              <div className='border-border/80 flex size-7 items-center justify-center rounded-xl bg-white md:size-[30px] dark:bg-white'>
                {ability.logo ? (
                  <img
                    src={ability.logo}
                    alt={t('{{name}} logo', { name: ability.name })}
                    className='size-5 object-contain'
                  />
                ) : (
                  <ImageIcon className='size-5 text-amber-500' />
                )}
              </div>
              <div className='min-w-0'>
                <strong className='block truncate text-xs leading-none font-semibold md:text-[15px]'>
                  {ability.name}
                </strong>
                <span className='text-muted-foreground mt-1 block truncate text-[9px] font-semibold md:mt-1.5 md:text-[11px]'>
                  {t(ability.description)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <svg
          className='pointer-events-none absolute top-0 left-0 z-[3] hidden h-[168px] w-full md:block'
          viewBox='0 0 560 168'
          aria-hidden='true'
          preserveAspectRatio='none'
        >
          <defs>
            <linearGradient
              id='heroLineGradient'
              x1='92'
              y1='0'
              x2='468'
              y2='0'
              gradientUnits='userSpaceOnUse'
            >
              <stop offset='0' stopColor='#60a5fa' />
              <stop offset='0.5' stopColor='#8b5cf6' />
              <stop offset='1' stopColor='#10b981' />
            </linearGradient>
          </defs>
          <path
            d='M112 86 C158 102 204 115 247 128'
            fill='none'
            stroke='url(#heroLineGradient)'
            strokeWidth='2.2'
            strokeLinecap='round'
            strokeLinejoin='round'
            opacity='0.68'
          />
          <path
            d='M280 86 L280 128'
            fill='none'
            stroke='url(#heroLineGradient)'
            strokeWidth='2.2'
            strokeLinecap='round'
            strokeLinejoin='round'
            opacity='0.68'
          />
          <path
            d='M448 86 C402 102 356 115 313 128'
            fill='none'
            stroke='url(#heroLineGradient)'
            strokeWidth='2.2'
            strokeLinecap='round'
            strokeLinejoin='round'
            opacity='0.68'
          />
        </svg>

        <div className='border-blue-200/80 bg-card/95 relative z-[4] mx-auto grid w-[210px] grid-cols-[32px_1fr] items-center gap-2 rounded-2xl border px-3 py-2.5 shadow-[0_16px_34px_rgba(37,99,235,0.13)] backdrop-blur-md md:absolute md:top-32 md:left-1/2 md:w-[226px] md:-translate-x-1/2 md:grid-cols-[38px_1fr] md:gap-2.5 md:px-4 md:py-3 dark:border-blue-400/30'>
          <div className='flex size-8 items-center justify-center rounded-xl bg-blue-50 md:size-[34px] dark:bg-blue-500/15'>
            <div className='size-5 rounded-[7px] bg-[linear-gradient(135deg,#2563eb,#10b981)] [clip-path:polygon(50%_0,90%_25%,90%_75%,50%_100%,10%_75%,10%_25%)]' />
          </div>
          <div>
            <span className='text-muted-foreground block text-[10px] font-bold md:text-[11px]'>
              {t('统一入口')}
            </span>
            <strong className='block text-base leading-none font-bold md:text-[19px]'>
              OpenAI API
            </strong>
          </div>
        </div>

        <img
          src='/home/generated/programmer-office-illustration.png'
          alt={t('Programmer working at a desk with coding screens')}
          className='relative z-[1] mt-1 h-[342px] w-full rounded-2xl object-cover object-[center_55%] shadow-[inset_0_0_0_1px_rgba(226,232,240,0.7),0_18px_42px_rgba(15,23,42,0.08)] md:absolute md:right-6 md:bottom-5 md:left-6 md:mt-0 md:h-[72%] md:w-[calc(100%-3rem)] md:rounded-[26px] md:object-[center_52%] dark:brightness-[0.86] dark:saturate-[0.9]'
        />
      </div>
    </div>
  )
}
