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
import { cn } from '@/lib/utils'

export function sideDrawerContentClassName(className?: string): string {
  return cn('flex h-dvh w-full flex-col gap-0 overflow-hidden p-0', className)
}

export function sideDrawerHeaderClassName(className?: string): string {
  return cn('border-b px-4 py-3 text-start sm:px-6 sm:py-4', className)
}

export function sideDrawerFormClassName(className?: string): string {
  return cn('flex-1 overflow-y-auto px-3 py-3 pb-4 sm:px-4', className)
}

export function sideDrawerFooterClassName(className?: string): string {
  return cn('grid grid-cols-2 gap-2 border-t px-4 py-3 sm:flex sm:px-6 sm:py-4', className)
}

export function sideDrawerSectionClassName(className?: string): string {
  return cn('space-y-4 rounded-lg border p-4', className)
}

export function sideDrawerSwitchItemClassName(className?: string): string {
  return cn('flex flex-row items-center justify-between gap-4 rounded-lg border p-4', className)
}
