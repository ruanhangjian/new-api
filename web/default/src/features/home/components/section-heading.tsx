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
import { cn } from '@/lib/utils'

interface SectionHeadingProps {
  kicker?: string
  title: string
  description?: string
  className?: string
}

export function SectionHeading(props: SectionHeadingProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'mb-8 grid gap-4 md:flex md:items-end md:justify-between md:gap-10',
        props.className
      )}
    >
      <div>
        {props.kicker && (
          <p className='mb-2 text-[13px] font-bold text-blue-600 dark:text-blue-400'>
            {t(props.kicker)}
          </p>
        )}
        <h2 className='text-2xl leading-tight font-bold tracking-tight md:text-[35px]'>
          {t(props.title)}
        </h2>
      </div>
      {props.description && (
        <p className='text-muted-foreground max-w-[470px] text-sm leading-7 md:text-[15px]'>
          {t(props.description)}
        </p>
      )}
    </div>
  )
}
