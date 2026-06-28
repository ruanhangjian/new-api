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
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Activity,
  Key,
  FileText,
  Wallet,
  HandCoins,
  Box,
  Users,
  Ticket,
  User,
  Command,
  Radio,
  FlaskConical,
  MessageSquare,
  CreditCard,
  ListTodo,
  Settings,
  WalletCards,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WORKSPACE_IDS } from '@/components/layout/lib/workspace-registry'
import { type SidebarData } from '@/components/layout/types'
import { getAffiliateRebateOverviewSilent } from '@/features/affiliate-rebate/api'

const DEFAULT_AFFILIATE_REBATE_RATE = 0.02

function formatAffiliateRebateRate(rate: number): string {
  const normalized = Number.isFinite(rate)
    ? rate
    : DEFAULT_AFFILIATE_REBATE_RATE
  const percentage = normalized * 100
  if (!Number.isFinite(percentage)) return '2%'
  return `${Number(percentage.toFixed(2)).toString()}%`
}

export function useSidebarData(): SidebarData {
  const { t } = useTranslation()
  const { data: affiliateRebateOverview } = useQuery({
    queryKey: ['affiliate-rebate-overview', 'sidebar-badge'],
    queryFn: async () => {
      try {
        const response = await getAffiliateRebateOverviewSilent()
        return response.success ? response.data : undefined
      } catch {
        return undefined
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const affiliateRebateRate = formatAffiliateRebateRate(
    affiliateRebateOverview?.rate ?? DEFAULT_AFFILIATE_REBATE_RATE
  )

  return {
    workspaces: [
      {
        id: WORKSPACE_IDS.DEFAULT,
        name: '', // Dynamically fetches system name
        logo: Command,
        plan: '', // Dynamically fetches system version
      },
    ],
    navGroups: [
      {
        id: 'chat',
        title: t('Chat'),
        items: [
          {
            title: t('Playground'),
            url: '/playground',
            icon: FlaskConical,
          },
          {
            title: t('Chat'),
            icon: MessageSquare,
            type: 'chat-presets',
          },
        ],
      },
      {
        id: 'general',
        title: t('General'),
        items: [
          {
            title: t('Overview'),
            url: '/dashboard/overview',
            icon: Activity,
          },
          {
            title: t('Dashboard'),
            url: '/dashboard/models',
            icon: LayoutDashboard,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
          },
          {
            title: t('Usage Logs'),
            url: '/usage-logs/common',
            icon: FileText,
          },
          {
            title: t('Channel Status'),
            url: '/channel-status',
            icon: Activity,
          },
          {
            title: t('Task Logs'),
            url: '/usage-logs/task',
            activeUrls: ['/usage-logs/drawing'],
            configUrls: ['/usage-logs/drawing', '/usage-logs/task'],
            icon: ListTodo,
          },
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          {
            title: t('Wallet'),
            url: '/wallet',
            icon: Wallet,
          },
          {
            title: t('Affiliate Rebate'),
            titleClassName: 'flex-none',
            url: '/affiliate-rebate',
            icon: HandCoins,
            badge: t('Lifetime {{rate}} Rebate', {
              rate: affiliateRebateRate,
            }),
            badgeClassName:
              'isolate relative -ml-1 h-[22px] items-start overflow-visible border-transparent bg-transparent px-1.5 pb-0 pt-[2px] text-[9px] font-bold leading-[12px] text-white shadow-none hover:bg-transparent dark:border-transparent dark:bg-transparent dark:text-white dark:hover:bg-transparent before:absolute before:inset-x-0 before:top-0 before:z-0 before:h-[17px] before:rounded-full before:bg-red-500 before:shadow-sm before:shadow-red-500/25 before:content-[""] after:absolute after:left-1 after:top-[13px] after:z-0 after:h-0 after:w-0 after:border-t-[8px] after:border-r-[9px] after:border-t-red-500 after:border-r-transparent after:content-[""]',
          },
          {
            title: t('Profile'),
            url: '/profile',
            icon: User,
          },
        ],
      },
      {
        id: 'admin',
        title: t('Admin'),
        items: [
          {
            title: t('Channels'),
            url: '/channels',
            icon: Radio,
          },
          {
            title: t('Channel Monitor'),
            url: '/channel-monitor',
            icon: Activity,
          },
          {
            title: t('Channel Balances'),
            url: '/channel-balances',
            icon: WalletCards,
          },
          {
            title: t('Models'),
            url: '/models/metadata',
            icon: Box,
          },
          {
            title: t('Users'),
            url: '/users',
            icon: Users,
          },
          {
            title: t('Redemption Codes'),
            url: '/redemption-codes',
            icon: Ticket,
          },
          {
            title: t('Subscription Management'),
            url: '/subscriptions',
            icon: CreditCard,
          },
          {
            title: t('System Settings'),
            url: '/system-settings/site',
            activeUrls: ['/system-settings'],
            icon: Settings,
          },
        ],
      },
    ],
  }
}
