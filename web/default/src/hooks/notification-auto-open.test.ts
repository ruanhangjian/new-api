import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  getAutoOpenNotificationTab,
  getAnnouncementKeysToMarkReadOnOpen,
  shouldAutoOpenNotifications,
} from './notification-auto-open'

describe('notification auto-open rules', () => {
  test('opens when notice or timeline announcements have unread content', () => {
    assert.equal(
      shouldAutoOpenNotifications({
        enabled: true,
        loading: false,
        unreadCount: 1,
        closedToday: false,
        alreadyOpened: false,
        dialogOpen: false,
      }),
      true
    )
  })

  test('does not open again after Close Today is used', () => {
    assert.equal(
      shouldAutoOpenNotifications({
        enabled: true,
        loading: false,
        unreadCount: 1,
        closedToday: true,
        alreadyOpened: false,
        dialogOpen: false,
      }),
      false
    )
  })

  test('uses timeline tab when only timeline announcements are unread', () => {
    assert.equal(
      getAutoOpenNotificationTab({
        unreadNoticeCount: 0,
        unreadAnnouncementsCount: 2,
      }),
      'announcements'
    )
  })

  test('marks timeline announcements as read when opening the timeline tab', () => {
    assert.deepEqual(
      getAnnouncementKeysToMarkReadOnOpen({
        tab: 'announcements',
        announcementKeys: ['id:1', 'id:2'],
      }),
      ['id:1', 'id:2']
    )
  })
})
