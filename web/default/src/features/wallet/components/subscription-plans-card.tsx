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
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  History,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  StatusBadge,
  dotColorMap,
  textColorMap,
} from '@/components/status-badge'
import {
  getPublicPlans,
  getSelfSubscriptionFull,
  updateBillingPreference,
} from '@/features/subscriptions/api'
import { SubscriptionPurchaseDialog } from '@/features/subscriptions/components/dialogs/subscription-purchase-dialog'
import {
  formatDuration,
  formatPlanDailyQuota,
  formatPlanSubscriptionTotalQuota,
  formatTimestamp,
  getPlanResetQuotaLabel,
  splitSellingPoints,
} from '@/features/subscriptions/lib'
import type {
  PlanRecord,
  UserSubscriptionRecord,
} from '@/features/subscriptions/types'
import type { PaymentMethod, TopupInfo } from '../types'

interface SubscriptionPlansCardProps {
  topupInfo: TopupInfo | null
  onAvailabilityChange?: (available: boolean) => void
  mode?: 'plans' | 'summary'
}

function getEpayMethods(payMethods: PaymentMethod[] = []): PaymentMethod[] {
  return payMethods.filter(
    (m) => m?.type && m.type !== 'stripe' && m.type !== 'creem'
  )
}

function getBillingPreferenceLabel(
  preference: string,
  t: (key: string) => string
): string {
  switch (preference) {
    case 'subscription_first':
      return t('Subscription First')
    case 'wallet_first':
      return t('Wallet First')
    case 'subscription_only':
      return t('Subscription Only')
    case 'wallet_only':
      return t('Wallet Only')
    default:
      return preference
  }
}

function getSubscriptionSortValue(sub: UserSubscriptionRecord): number {
  const subscription = sub.subscription
  return (
    Number(subscription?.created_at || 0) ||
    Number(subscription?.start_time || 0) ||
    Number(subscription?.id || 0)
  )
}

function getRemainingDays(sub: UserSubscriptionRecord) {
  const endTime = sub?.subscription?.end_time || 0
  if (!endTime) return 0
  const now = Date.now() / 1000
  return Math.max(0, Math.ceil((endTime - now) / 86400))
}

function getUsagePercent(sub: UserSubscriptionRecord) {
  const total = Number(sub?.subscription?.amount_total || 0)
  const used = Number(sub?.subscription?.amount_used || 0)
  if (total <= 0) return 0
  return Math.min(100, Math.round((used / total) * 100))
}

function getStatusMeta(
  sub: UserSubscriptionRecord,
  t: (key: string) => string
) {
  const subscription = sub.subscription
  const now = Date.now() / 1000
  const isExpired = (subscription?.end_time || 0) < now
  const isCancelled = subscription?.status === 'cancelled'
  const isActive = subscription?.status === 'active' && !isExpired

  if (isActive) return { label: t('Active'), variant: 'success' as const }
  if (isCancelled) {
    return { label: t('Cancelled'), variant: 'neutral' as const }
  }
  return { label: t('Expired'), variant: 'neutral' as const }
}

function SubscriptionUsageCard({
  sub,
  planTitle,
  compact = false,
}: {
  sub: UserSubscriptionRecord
  planTitle?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const subscription = sub.subscription
  const totalAmount = Number(subscription?.amount_total || 0)
  const usedAmount = Number(subscription?.amount_used || 0)
  const remainAmount =
    totalAmount > 0 ? Math.max(0, totalAmount - usedAmount) : 0
  const usagePercent = getUsagePercent(sub)
  const remainDays = getRemainingDays(sub)
  const status = getStatusMeta(sub, t)
  const isActive = status.variant === 'success'

  return (
    <div
      className={cn(
        'bg-background/50 rounded-lg border p-3',
        compact ? 'space-y-2' : 'space-y-3'
      )}
    >
      <div className='flex min-w-0 items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex min-w-0 items-center gap-2'>
            <span className='truncate text-sm font-medium'>
              {planTitle || `${t('Subscription')} #${subscription?.id}`}
            </span>
            <StatusBadge
              label={status.label}
              variant={status.variant}
              copyable={false}
            />
          </div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {isActive ? t('Until') : t('Expired at')}{' '}
            {formatTimestamp(subscription?.end_time || 0)}
          </div>
        </div>
        {isActive && (
          <span className='text-muted-foreground shrink-0 text-xs'>
            {t('{{count}} days remaining', { count: remainDays })}
          </span>
        )}
      </div>

      <div className='text-muted-foreground text-xs'>
        {totalAmount > 0 ? (
          <Tooltip>
            <TooltipTrigger render={<span className='cursor-help' />}>
              {t('Total Quota')} {formatQuota(usedAmount)} /{' '}
              {formatQuota(totalAmount)} · {t('Remaining')}{' '}
              {formatQuota(remainAmount)}
            </TooltipTrigger>
            <TooltipContent>
              {t('Raw Quota')}: {usedAmount}/{totalAmount} · {t('Remaining')}{' '}
              {remainAmount}
            </TooltipContent>
          </Tooltip>
        ) : (
          <>
            {t('Total Quota')} {t('Unlimited')}
          </>
        )}
      </div>

      {totalAmount > 0 && (
        <div className='space-y-1.5'>
          <Progress value={usagePercent} className='h-1.5' />
          <div className='text-muted-foreground flex justify-between text-xs'>
            <span>
              {t('Used')} {usagePercent}%
            </span>
            {isActive && (subscription?.next_reset_time ?? 0) > 0 && (
              <span>
                {t('Next reset')}:{' '}
                {formatTimestamp(subscription.next_reset_time!)}
              </span>
            )}
          </div>
        </div>
      )}

      {!compact && (
        <div className='text-muted-foreground grid grid-cols-2 gap-2 text-xs'>
          <div>
            {t('Source')}: {subscription?.source || '-'}
          </div>
          <div>
            {t('Created At')}: {formatTimestamp(subscription?.created_at || 0)}
          </div>
        </div>
      )}
    </div>
  )
}

export function SubscriptionPlansCard({
  topupInfo,
  onAvailabilityChange,
  mode = 'plans',
}: SubscriptionPlansCardProps) {
  const { t, i18n } = useTranslation()

  const [plans, setPlans] = useState<PlanRecord[]>([])
  const [activeSubscriptions, setActiveSubscriptions] = useState<
    UserSubscriptionRecord[]
  >([])
  const [allSubscriptions, setAllSubscriptions] = useState<
    UserSubscriptionRecord[]
  >([])
  const [billingPreference, setBillingPreference] =
    useState('subscription_first')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PlanRecord | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const enableStripe = !!topupInfo?.enable_stripe_topup
  const enableCreem = !!topupInfo?.enable_creem_topup
  const enableWaffoPancake = !!topupInfo?.enable_waffo_pancake_topup
  const enableOnlineTopUp = !!topupInfo?.enable_online_topup
  const epayMethods = useMemo(
    () => getEpayMethods(topupInfo?.pay_methods),
    [topupInfo?.pay_methods]
  )

  const fetchPlans = useCallback(async () => {
    try {
      const res = await getPublicPlans()
      if (res.success) {
        setPlans(res.data || [])
      }
    } catch {
      setPlans([])
    }
  }, [])

  const fetchSelfSubscription = useCallback(async () => {
    try {
      const res = await getSelfSubscriptionFull()
      if (res.success && res.data) {
        setBillingPreference(
          res.data.billing_preference || 'subscription_first'
        )
        setActiveSubscriptions(res.data.subscriptions || [])
        setAllSubscriptions(res.data.all_subscriptions || [])
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([fetchPlans(), fetchSelfSubscription()])
      setLoading(false)
    }
    init()
  }, [fetchPlans, fetchSelfSubscription])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchSelfSubscription()
    } finally {
      setRefreshing(false)
    }
  }

  const handlePreferenceChange = async (pref: string) => {
    const previous = billingPreference
    setBillingPreference(pref)
    try {
      const res = await updateBillingPreference(pref)
      if (res.success) {
        toast.success(t('Updated successfully'))
        const normalized = res.data?.billing_preference || pref
        setBillingPreference(normalized)
      } else {
        toast.error(res.message || t('Update failed'))
        setBillingPreference(previous)
      }
    } catch {
      toast.error(t('Request failed'))
      setBillingPreference(previous)
    }
  }

  const hasActive = activeSubscriptions.length > 0
  const hasAny = allSubscriptions.length > 0
  const isAvailable = loading || plans.length > 0 || hasAny
  const disablePref = !hasActive
  const isSubPref =
    billingPreference === 'subscription_first' ||
    billingPreference === 'subscription_only'
  const displayPref =
    disablePref && isSubPref ? 'wallet_first' : billingPreference

  useEffect(() => {
    onAvailabilityChange?.(isAvailable)
  }, [isAvailable, onAvailabilityChange])

  const planPurchaseCountMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const sub of allSubscriptions) {
      const planId = sub?.subscription?.plan_id
      if (!planId) continue
      map.set(planId, (map.get(planId) || 0) + 1)
    }
    return map
  }, [allSubscriptions])

  const planTitleMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of plans) {
      if (p?.plan?.id) {
        map.set(p.plan.id, p.plan.title || '')
      }
    }
    return map
  }, [plans])

  const sortedSubscriptions = useMemo(
    () =>
      [...allSubscriptions].sort(
        (a, b) => getSubscriptionSortValue(b) - getSubscriptionSortValue(a)
      ),
    [allSubscriptions]
  )
  const sortedActiveSubscriptions = useMemo(
    () =>
      [...activeSubscriptions].sort(
        (a, b) => getSubscriptionSortValue(b) - getSubscriptionSortValue(a)
      ),
    [activeSubscriptions]
  )
  const primaryActive = sortedActiveSubscriptions[0]
  const expiredCount = Math.max(
    0,
    allSubscriptions.length - activeSubscriptions.length
  )

  const scrollPlans = (direction: 'left' | 'right') => {
    const el = scrollerRef.current
    if (!el) return
    const delta = el.clientWidth * 0.85 * (direction === 'right' ? 1 : -1)
    el.scrollBy({ left: delta, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <Card className='gap-0 overflow-hidden py-0'>
        <CardContent className='space-y-4 p-3 sm:p-5'>
          <Skeleton className='h-24 w-full' />
          <Skeleton className='h-48 w-full' />
        </CardContent>
      </Card>
    )
  }

  if (plans.length === 0 && !hasAny) {
    return null
  }

  const summary = (
    <>
      <TitledCard
        title={t('My Subscriptions')}
        icon={<Crown className='h-4 w-4' />}
        headerClassName='p-3 !pb-3 sm:p-4 sm:!pb-3'
        action={
          hasAny ? (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setHistoryOpen(true)}
              className='gap-1.5'
            >
              {t('View All')}
            </Button>
          ) : null
        }
        contentClassName='space-y-3 p-3 sm:p-4'
      >
        <div className='flex flex-wrap items-center gap-2 text-xs font-medium'>
          <span className='flex items-center gap-1.5'>
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                hasActive ? dotColorMap.success : dotColorMap.neutral
              )}
              aria-hidden='true'
            />
            {hasActive ? (
              <span className={cn(textColorMap.success)}>
                {activeSubscriptions.length} {t('active')}
              </span>
            ) : (
              <span className='text-muted-foreground'>{t('No Active')}</span>
            )}
          </span>
          <span className='text-muted-foreground/30'>·</span>
          <span className='text-muted-foreground'>
            {expiredCount} {t('history')}
          </span>
        </div>

        {primaryActive ? (
          <SubscriptionUsageCard
            sub={primaryActive}
            planTitle={planTitleMap.get(primaryActive.subscription?.plan_id)}
            compact
          />
        ) : (
          <div className='rounded-lg border border-dashed p-4 text-sm'>
            <div className='font-medium'>{t('No active subscription')}</div>
            <div className='text-muted-foreground mt-1 text-xs'>
              {t('Choose a subscription plan below to unlock priority access.')}
            </div>
          </div>
        )}

        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2'>
          <div className='rounded-lg border p-3'>
            <div className='mb-2 text-sm font-medium'>
              {t('Subscription Priority')}
            </div>
            <Select
              items={[
                {
                  value: 'subscription_first',
                  label: (
                    <>
                      {getBillingPreferenceLabel('subscription_first', t)}
                      {disablePref ? ` (${t('No Active')})` : ''}
                    </>
                  ),
                },
                {
                  value: 'wallet_first',
                  label: getBillingPreferenceLabel('wallet_first', t),
                },
                {
                  value: 'subscription_only',
                  label: (
                    <>
                      {getBillingPreferenceLabel('subscription_only', t)}
                      {disablePref ? ` (${t('No Active')})` : ''}
                    </>
                  ),
                },
                {
                  value: 'wallet_only',
                  label: getBillingPreferenceLabel('wallet_only', t),
                },
              ]}
              value={displayPref}
              onValueChange={(v) => v !== null && handlePreferenceChange(v)}
            >
              <SelectTrigger className='h-8 w-full text-xs'>
                <SelectValue>
                  {getBillingPreferenceLabel(displayPref, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='subscription_first' disabled={disablePref}>
                    {getBillingPreferenceLabel('subscription_first', t)}
                    {disablePref ? ` (${t('No Active')})` : ''}
                  </SelectItem>
                  <SelectItem value='wallet_first'>
                    {getBillingPreferenceLabel('wallet_first', t)}
                  </SelectItem>
                  <SelectItem value='subscription_only' disabled={disablePref}>
                    {getBillingPreferenceLabel('subscription_only', t)}
                    {disablePref ? ` (${t('No Active')})` : ''}
                  </SelectItem>
                  <SelectItem value='wallet_only'>
                    {getBillingPreferenceLabel('wallet_only', t)}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className='text-muted-foreground mt-2 text-xs'>
              {t(
                'Use wallet balance first; subscription quota acts as backup.'
              )}
            </div>
          </div>

          <button
            type='button'
            className='hover:bg-muted/40 focus-visible:ring-ring rounded-lg border p-3 text-left transition outline-none focus-visible:ring-3'
            onClick={() => setHistoryOpen(true)}
          >
            <div className='flex items-center justify-between gap-3'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                {t('Subscription History')}
                <span className='bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs'>
                  {allSubscriptions.length}
                </span>
              </div>
              <ChevronRight className='text-muted-foreground h-4 w-4' />
            </div>
            <div className='text-muted-foreground mt-2 text-xs'>
              {t('View expired plans and usage records')}
            </div>
          </button>
        </div>

        {disablePref && isSubPref && (
          <p className='text-muted-foreground text-xs'>
            {t(
              'Preference saved as {{pref}}, but no active subscription. Wallet will be used automatically.',
              {
                pref:
                  billingPreference === 'subscription_only'
                    ? t('Subscription Only')
                    : t('Subscription First'),
              }
            )}
          </p>
        )}
      </TitledCard>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className='w-full gap-0 p-0 sm:max-w-xl'>
          <SheetHeader className='border-b px-4 py-4 text-start sm:px-6'>
            <SheetTitle className='flex items-center gap-2'>
              <History className='h-4 w-4' />
              {t('Subscription History')}
            </SheetTitle>
            <SheetDescription>
              {t('View expired plans and usage records')}
            </SheetDescription>
          </SheetHeader>
          <div className='flex-1 space-y-3 overflow-y-auto p-4 sm:p-6'>
            <div className='flex items-center justify-between'>
              <div className='text-sm font-medium'>
                {allSubscriptions.length} {t('records')}
              </div>
              <Button
                variant='outline'
                size='sm'
                className='gap-1.5'
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
                />
                {t('Refresh')}
              </Button>
            </div>
            {sortedSubscriptions.length > 0 ? (
              sortedSubscriptions.map((sub) => (
                <SubscriptionUsageCard
                  key={sub.subscription?.id}
                  sub={sub}
                  planTitle={planTitleMap.get(sub.subscription?.plan_id)}
                />
              ))
            ) : (
              <div className='rounded-lg border border-dashed p-6 text-center text-sm'>
                <div className='font-medium'>
                  {t('No subscription history yet')}
                </div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {t(
                    'Choose a subscription plan below to unlock priority access.'
                  )}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )

  if (mode === 'summary') {
    return summary
  }

  return (
    <>
      <TitledCard
        title={t('Subscription Plans')}
        description={t(
          'Subscribe to a plan for higher quota and priority access'
        )}
        icon={<Crown className='h-4 w-4' />}
        contentClassName='space-y-4'
      >
        {plans.length > 0 ? (
          <div className='relative'>
            {plans.length > 4 && (
              <>
                <Button
                  variant='outline'
                  size='icon'
                  className='bg-card/95 absolute top-1/2 left-1 z-10 hidden -translate-y-1/2 rounded-full border shadow-sm backdrop-blur xl:inline-flex'
                  onClick={() => scrollPlans('left')}
                  aria-label={t('Previous')}
                >
                  <ChevronLeft className='h-4 w-4' />
                </Button>
                <Button
                  variant='outline'
                  size='icon'
                  className='bg-card/95 absolute top-1/2 right-1 z-10 hidden -translate-y-1/2 rounded-full border shadow-sm backdrop-blur xl:inline-flex'
                  onClick={() => scrollPlans('right')}
                  aria-label={t('Next')}
                >
                  <ChevronRight className='h-4 w-4' />
                </Button>
              </>
            )}
            <div
              ref={scrollerRef}
              className='scrollbar-thin -mx-2 flex snap-x gap-3 overflow-x-auto scroll-smooth px-2 pt-2 pb-3 sm:gap-4 xl:-mx-3 xl:px-3'
            >
              {plans.map((p, index) => {
                const plan = p?.plan
                if (!plan) return null
                const price = Number(plan.price_amount || 0).toFixed(2)
                const isPopular = index === 0 && plans.length > 1
                const limit = Number(plan.max_purchase_per_user || 0)
                const count = planPurchaseCountMap.get(plan.id) || 0
                const reached = limit > 0 && count >= limit
                const sellingPoints = splitSellingPoints(
                  plan.selling_points,
                  t('Priority channel')
                )
                const duration = formatDuration(plan, t)
                const cardValidity = t('Valid for {{duration}}', {
                  duration: i18n.language.toLowerCase().startsWith('zh')
                    ? duration.replace(/\s+/g, '')
                    : duration,
                })

                return (
                  <Card
                    key={plan.id}
                    className={cn(
                      'group/subscription-plan bg-card min-h-[360px] w-[78vw] min-w-[232px] shrink-0 snap-start rounded-2xl border py-0 transition-all duration-200 sm:w-[calc((100%-1rem)/2)] xl:w-[calc((100%-3rem)/4)] xl:min-w-0',
                      'hover:border-primary/70 hover:shadow-primary/10 hover:ring-primary/25 hover:-translate-y-1 hover:shadow-2xl hover:ring-2',
                      isPopular
                        ? 'border-primary/70 ring-primary/20 shadow-primary/10 shadow-lg ring-2'
                        : 'border-border/90 ring-border/50 shadow-sm ring-1'
                    )}
                  >
                    <CardContent className='flex h-full flex-col p-0'>
                      <div className='relative flex-1 px-3.5 pt-5 pb-3.5 sm:px-4 sm:pt-6'>
                        {isPopular && (
                          <span className='bg-primary/10 text-primary absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[10px] font-semibold'>
                            {t('Recommended')}
                          </span>
                        )}

                        <div className='space-y-1.5 pt-5 text-center'>
                          <h4 className='mx-auto line-clamp-2 max-w-[10rem] text-base leading-snug font-semibold sm:text-lg'>
                            {plan.title || t('Subscription Plans')}
                          </h4>
                          <p className='text-muted-foreground text-xs font-medium'>
                            {cardValidity}
                          </p>
                          <div className='pt-2.5'>
                            <span className='text-foreground text-2xl leading-none font-bold tracking-normal sm:text-3xl'>
                              ￥{price}
                            </span>
                          </div>
                        </div>

                        <div className='mt-5 space-y-2'>
                          <div className='bg-muted/35 border-border/70 flex min-h-11 items-center justify-between gap-2 rounded-xl border px-2.5 py-2'>
                            <span className='text-muted-foreground shrink-0 text-[11px] font-medium'>
                              {getPlanResetQuotaLabel(plan, t)}
                            </span>
                            <span className='text-foreground min-w-0 text-right text-xs font-semibold break-words'>
                              {formatPlanDailyQuota(plan, t)}
                            </span>
                          </div>

                          <div className='bg-muted/35 border-border/70 flex min-h-11 items-center justify-between gap-2 rounded-xl border px-2.5 py-2'>
                            <span className='text-muted-foreground shrink-0 text-[11px] font-medium'>
                              {t('Subscription Total Quota')}
                            </span>
                            <span className='text-foreground min-w-0 text-right text-xs font-semibold break-words'>
                              {formatPlanSubscriptionTotalQuota(plan, t)}
                            </span>
                          </div>
                        </div>

                        <div className='mt-4 space-y-2'>
                          {sellingPoints.slice(0, 3).map((point) => (
                            <div
                              key={point}
                              className='flex items-start gap-2 text-left'
                            >
                              <span className='bg-primary/10 text-primary mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full'>
                                <Check className='h-3 w-3' />
                              </span>
                              <span className='text-foreground text-xs leading-snug font-medium'>
                                {point}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className='border-border/70 border-t px-3.5 py-3.5 sm:px-4'>
                        {reached ? (
                          <Tooltip>
                            <TooltipTrigger render={<div />}>
                              <Button
                                variant='outline'
                                className='h-10 w-full rounded-full text-xs font-semibold'
                                disabled
                              >
                                {t('Limit Reached')}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t('Purchase limit reached')} ({count}/{limit})
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            className='bg-foreground text-background hover:bg-foreground/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90 h-10 w-full rounded-full text-xs font-semibold'
                            onClick={() => {
                              setSelectedPlan(p)
                              setPurchaseOpen(true)
                            }}
                          >
                            {t('Subscribe Now')}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
            {plans.length > 1 && (
              <div className='mt-2 flex justify-center gap-2'>
                {plans.map((plan, index) => (
                  <span
                    key={plan.plan?.id || index}
                    className={cn(
                      'size-2 rounded-full',
                      index === 0 ? 'bg-primary' : 'bg-muted-foreground/30'
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            {t('No plans available')}
          </p>
        )}
      </TitledCard>

      <SubscriptionPurchaseDialog
        open={purchaseOpen}
        onOpenChange={(open) => {
          setPurchaseOpen(open)
          if (!open) {
            fetchSelfSubscription()
          }
        }}
        plan={selectedPlan}
        enableStripe={enableStripe}
        enableCreem={enableCreem}
        enableWaffoPancake={enableWaffoPancake}
        enableOnlineTopUp={enableOnlineTopUp}
        epayMethods={epayMethods}
        purchaseLimit={
          selectedPlan?.plan?.max_purchase_per_user
            ? Number(selectedPlan.plan.max_purchase_per_user)
            : undefined
        }
        purchaseCount={
          selectedPlan?.plan?.id
            ? planPurchaseCountMap.get(selectedPlan.plan.id)
            : undefined
        }
      />
    </>
  )
}
