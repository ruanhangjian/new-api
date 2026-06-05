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

export type NotificationTab = 'notice' | 'announcements'

type AutoOpenNotificationState = {
  enabled: boolean
  loading: boolean
  unreadCount: number
  closedToday: boolean
  alreadyOpened: boolean
  dialogOpen: boolean
}

type AutoOpenTabState = {
  unreadNoticeCount: number
  unreadAnnouncementsCount: number
}

type MarkReadOnOpenState = {
  tab: NotificationTab
  announcementKeys: string[]
}

export function shouldAutoOpenNotifications({
  enabled,
  loading,
  unreadCount,
  closedToday,
  alreadyOpened,
  dialogOpen,
}: AutoOpenNotificationState): boolean {
  return (
    enabled &&
    !loading &&
    unreadCount > 0 &&
    !closedToday &&
    !alreadyOpened &&
    !dialogOpen
  )
}

export function getAutoOpenNotificationTab({
  unreadNoticeCount,
  unreadAnnouncementsCount,
}: AutoOpenTabState): NotificationTab {
  if (unreadNoticeCount > 0) {
    return 'notice'
  }

  if (unreadAnnouncementsCount > 0) {
    return 'announcements'
  }

  return 'notice'
}

export function getAnnouncementKeysToMarkReadOnOpen({
  tab,
  announcementKeys,
}: MarkReadOnOpenState): string[] {
  return tab === 'announcements' ? announcementKeys : []
}
