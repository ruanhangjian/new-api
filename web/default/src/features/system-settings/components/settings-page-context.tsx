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
import { RotateCcw, Save } from 'lucide-react'
import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

type SettingsPageContextValue = {
  actionsContainer: HTMLDivElement | null
  titleStatusContainer: HTMLSpanElement | null
  suppressSectionHeader: boolean
}

const SettingsPageContext = createContext<SettingsPageContextValue | null>(null)

type SettingsPageProviderProps = {
  actionsContainer: HTMLDivElement | null
  titleStatusContainer: HTMLSpanElement | null
  suppressSectionHeader?: boolean
  children: ReactNode
}

export function SettingsPageProvider({
  actionsContainer,
  titleStatusContainer,
  suppressSectionHeader = false,
  children,
}: SettingsPageProviderProps) {
  return (
    <SettingsPageContext.Provider
      value={{
        actionsContainer,
        titleStatusContainer,
        suppressSectionHeader,
      }}
    >
      {children}
    </SettingsPageContext.Provider>
  )
}

function useSettingsPageContext() {
  return useContext(SettingsPageContext)
}

export function useSuppressSettingsSectionHeader() {
  return useSettingsPageContext()?.suppressSectionHeader ?? false
}

export function SettingsPageActionsPortal({
  children,
}: {
  children: ReactNode
}) {
  const container = useSettingsPageContext()?.actionsContainer
  if (!container) return null
  return createPortal(children, container)
}

export function SettingsPageTitleStatusPortal({
  children,
}: {
  children: ReactNode
}) {
  const container = useSettingsPageContext()?.titleStatusContainer
  if (!container) return null
  return createPortal(children, container)
}

type SettingsPageFormActionsProps = {
  isDirty?: boolean
  isSaving?: boolean
  isResetting?: boolean
  onReset?: () => void
  saveText?: string
  resetText?: string
  children?: ReactNode
} & Omit<ComponentProps<'button'>, 'children' | 'onReset'>

export function SettingsPageFormActions({
  isDirty = true,
  isSaving,
  isResetting,
  onReset,
  saveText,
  resetText,
  children,
  disabled,
  type = 'submit',
  ...buttonProps
}: SettingsPageFormActionsProps) {
  const { t } = useTranslation()

  return (
    <SettingsPageActionsPortal>
      {children ?? (
        <>
          {onReset && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={onReset}
              disabled={isResetting}
            >
              <RotateCcw data-icon='inline-start' />
              {resetText ? t(resetText) : t('Reset')}
            </Button>
          )}
          <Button
            {...buttonProps}
            type={type}
            size='sm'
            disabled={disabled || !isDirty || isSaving}
          >
            <Save data-icon='inline-start' />
            {isSaving ? t('Saving...') : saveText ? t(saveText) : t('Save')}
          </Button>
        </>
      )}
    </SettingsPageActionsPortal>
  )
}
