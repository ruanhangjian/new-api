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
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HomepageAction } from '../constants'

interface HomeActionButtonProps {
  action: HomepageAction
  className?: string
  variant?: 'primary' | 'secondary' | 'blue'
  showArrow?: boolean
}

const variantClassNames = {
  primary:
    'h-12 rounded-xl bg-foreground px-5 text-sm font-semibold text-background shadow-[0_14px_32px_rgba(15,23,42,0.16)] hover:bg-foreground/90 md:px-6',
  secondary:
    'border-border/70 bg-card/80 text-foreground hover:bg-muted/70 h-12 rounded-xl px-5 text-sm font-semibold backdrop-blur md:px-6',
  blue:
    'h-12 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(37,99,235,0.24)] hover:bg-blue-500 md:px-6',
}

export function HomeActionButton(props: HomeActionButtonProps) {
  const { t } = useTranslation()
  const { action, className, variant = 'secondary', showArrow } = props
  const content = (
    <>
      {t(action.label)}
      {showArrow && (
        <ArrowRight className='ml-1 size-4 transition-transform duration-200 group-hover/button:translate-x-0.5' />
      )}
    </>
  )

  if (action.status === 'linked' && action.route) {
    return (
      <Button
        className={cn(variantClassNames[variant], className)}
        render={<Link to={action.route} />}
      >
        {content}
      </Button>
    )
  }

  if (action.status === 'linked' && action.href) {
    return (
      <Button
        className={cn(variantClassNames[variant], className)}
        render={
          <a
            href={action.href}
            target={action.external ? '_blank' : undefined}
            rel={action.external ? 'noopener noreferrer' : undefined}
          />
        }
      >
        {content}
      </Button>
    )
  }

  return (
    <Button
      type='button'
      className={cn(variantClassNames[variant], 'cursor-default', className)}
    >
      {content}
    </Button>
  )
}
