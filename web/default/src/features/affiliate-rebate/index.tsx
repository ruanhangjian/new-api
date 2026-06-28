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
import { useMemo, useState, type ElementType } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  CalendarDays,
  ChevronRight,
  Copy,
  Gift,
  Info,
  RefreshCw,
  Share2,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { getSelf } from '@/lib/api'
import {
  formatQuota,
  formatTimestampToDate,
  quotaUnitsToDollars,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { generateAffiliateLink } from '@/features/wallet/lib'
import {
  getAffiliateCode,
  getAffiliateRebateDailySettlements,
  getAffiliateRebateOverview,
  getAffiliateRebateSettlements,
  transferAffiliateQuota,
} from './api'
import {
  canTransferAffiliateReward,
  getDefaultAffiliateTransferAmount,
} from './transfer'
import {
  buildAffiliateRebateTrend,
  getAffiliateRebateTrendBarHeight,
} from './trend'
import type {
  AffiliateInviteeSummary,
  AffiliateRebateDailySettlement,
  AffiliateRebateSettlement,
} from './types'

type InviteeFilter = 'all' | 'active'

const SHARE_COPY_KEYS = [
  'I use ZhiLian AI for stable multi-model API access, transparent quota, and no inflated usage. Register with my invite link: {{link}}',
  'Recommended: ZhiLian AI supports multiple models, stable API forwarding, and clear quota billing. My invite link: {{link}}',
  'ZhiLian AI has been stable for my model API usage, with practical quota and support for mainstream models. Register here: {{link}}',
  'If you need a stable AI API platform with clear quota and multiple model options, try ZhiLian AI: {{link}}',
  'ZhiLian AI supports GPT, Claude, and other models. The API is stable and the quota is straightforward. Invite link: {{link}}',
  'I recommend ZhiLian AI for daily AI API usage: stable service, transparent billing, and multiple models. {{link}}',
  'I am using ZhiLian AI for multi-model API access. It is stable and the quota feels solid. Register with my link: {{link}}',
  'ZhiLian AI supports multiple models with stable routing and clear quota, no inflated numbers. Invite link: {{link}}',
] as const

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '-'
  return `${(rate * 100).toFixed(2)}%`
}

function formatQuotaPlain(quota: number): string {
  const amount = quotaUnitsToDollars(quota)
  if (!Number.isFinite(amount)) return '-'
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: amount < 1 && amount > 0 ? 4 : 2,
    maximumFractionDigits: amount < 1 && amount > 0 ? 4 : 2,
  })
}

function getStatusBadgeVariant(status: AffiliateInviteeSummary['status']) {
  if (status === 'pending') return 'default'
  if (status === 'below_minimum') return 'outline'
  return 'secondary'
}

export function AffiliateRebate() {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const user = useAuthStore((state) => state.auth.user)
  const [transferring, setTransferring] = useState(false)
  const [filter, setFilter] = useState<InviteeFilter>('all')
  const [settledDialogOpen, setSettledDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [selectedInvitee, setSelectedInvitee] =
    useState<AffiliateInviteeSummary | null>(null)

  const overviewQuery = useQuery({
    queryKey: ['affiliate-rebate-overview'],
    queryFn: getAffiliateRebateOverview,
  })
  const codeQuery = useQuery({
    queryKey: ['affiliate-code'],
    queryFn: getAffiliateCode,
  })
  const settlementsQuery = useQuery({
    queryKey: ['affiliate-rebate-settlements', selectedInvitee?.user_id],
    queryFn: () => getAffiliateRebateSettlements(selectedInvitee!.user_id, 14),
    enabled: selectedInvitee != null,
  })
  const dailySettlementsQuery = useQuery({
    queryKey: ['affiliate-rebate-settlements-daily'],
    queryFn: () => getAffiliateRebateDailySettlements(30),
    enabled: settledDialogOpen,
  })

  const overview = overviewQuery.data?.data
  const inviteLink = useMemo(() => {
    if (!codeQuery.data?.data) return ''
    return generateAffiliateLink(codeQuery.data.data)
  }, [codeQuery.data?.data])

  const invitees = useMemo(() => {
    const source = overview?.invitees ?? []
    if (filter === 'active') {
      return source.filter((invitee) => invitee.today_consumed_quota > 0)
    }
    return source
  }, [filter, overview?.invitees])

  const progressValue = useMemo(() => {
    if (!overview || overview.daily_cap_quota <= 0) return 0
    return Math.min(
      100,
      Math.round((overview.today_reward_quota / overview.daily_cap_quota) * 100)
    )
  }, [overview])

  const handleCopyLink = () => {
    if (inviteLink) {
      copyToClipboard(inviteLink)
    }
  }

  const generateShareMessage = () => {
    if (!inviteLink) return
    const messages = SHARE_COPY_KEYS.map((key) => t(key, { link: inviteLink }))
    const pool = messages.filter((message) => message !== shareMessage)
    const candidates = pool.length > 0 ? pool : messages
    const next = candidates[Math.floor(Math.random() * candidates.length)]
    setShareMessage(next)
  }

  const handleOpenShareDialog = () => {
    if (!inviteLink) return
    const messages = SHARE_COPY_KEYS.map((key) => t(key, { link: inviteLink }))
    const next = messages[Math.floor(Math.random() * messages.length)]
    setShareMessage(next)
    setShareDialogOpen(true)
  }

  const handleCopyShareMessage = () => {
    if (shareMessage) {
      copyToClipboard(shareMessage)
    }
  }

  const handleTransfer = async () => {
    const availableQuota = overview?.pending_reward_quota ?? 0
    if (!canTransferAffiliateReward(availableQuota)) return

    try {
      setTransferring(true)
      const response = await transferAffiliateQuota({
        quota: getDefaultAffiliateTransferAmount(availableQuota),
      })
      if (!response.success) return

      await overviewQuery.refetch()
      const selfResponse = await getSelf()
      if (selfResponse.success && selfResponse.data) {
        useAuthStore.getState().auth.setUser(selfResponse.data)
      }
      toast.success(t('Affiliate rewards transferred to balance'))
    } finally {
      setTransferring(false)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]'>
        <Card className='border-primary/15 from-primary/10 via-card to-card bg-gradient-to-br'>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='space-y-1'>
                <Badge variant='outline' className='bg-background/60'>
                  {t('Affiliate Rebate')}
                </Badge>
                <CardTitle className='text-2xl'>
                  {t('Earn continuous rebate from invited users')}
                </CardTitle>
                <CardDescription className='max-w-2xl'>
                  {t(
                    'Invite users and earn {{rate}} of their actual usage after daily settlement.',
                    { rate: formatRate(overview?.rate ?? 0.02) }
                  )}
                </CardDescription>
              </div>
              <Button
                variant='outline'
                onClick={() => overviewQuery.refetch()}
                disabled={overviewQuery.isFetching}
              >
                <RefreshCw
                  className={cn(overviewQuery.isFetching && 'animate-spin')}
                />
                {t('Refresh')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-3 sm:grid-cols-3'>
              <MetricCard
                label={t('Pending rebate')}
                value={formatQuota(overview?.pending_reward_quota ?? 0)}
                icon={Gift}
              />
              <MetricCard
                label={t('Total settled rebate')}
                value={formatQuota(overview?.total_reward_quota ?? 0)}
                icon={TrendingUp}
                hint={t('View details')}
                onClick={() => setSettledDialogOpen(true)}
              />
              <MetricCard
                label={t('Invited users')}
                value={(overview?.invite_count ?? 0).toLocaleString()}
                icon={Users}
              />
            </div>

            <div className='bg-background/60 rounded-xl border p-3'>
              <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <p className='text-sm font-medium'>
                    {t('Today estimated rebate amount')}
                  </p>
                </div>
                <div className='text-right text-sm font-semibold tabular-nums'>
                  {formatQuota(overview?.today_reward_quota ?? 0)}
                  <span className='text-muted-foreground px-1'>/</span>
                  {formatQuota(overview?.daily_cap_quota ?? 0)}
                </div>
              </div>
              <Progress value={progressValue} />
              <p className='text-muted-foreground mt-2 text-xs'>
                {t('Single-day rebate below {{amount}} will not be settled', {
                  amount: formatQuota(overview?.min_settlement_quota ?? 0),
                })}
              </p>
            </div>

            <div className='bg-background/80 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center'>
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium'>{t('Your Referral Link')}</p>
                <p className='text-muted-foreground truncate text-xs'>
                  {inviteLink || t('Generating invite link...')}
                </p>
              </div>
              <div className='flex flex-col gap-2 sm:flex-row sm:self-stretch'>
                <Button onClick={handleCopyLink} disabled={!inviteLink}>
                  <Copy />
                  {t('Copy invite link')}
                </Button>
                <Button
                  variant='outline'
                  onClick={handleOpenShareDialog}
                  disabled={!inviteLink}
                >
                  <Share2 />
                  {t('Generate share copy')}
                </Button>
              </div>
            </div>

            <div className='bg-background/80 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='min-w-0'>
                <p className='text-sm font-medium'>{t('Available Rewards')}</p>
                <p className='text-muted-foreground text-xs'>
                  {t('Move affiliate rewards to your main balance')}
                </p>
              </div>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
                <div className='text-right'>
                  <p className='text-muted-foreground text-xs'>
                    {t('Pending rebate')}
                  </p>
                  <p className='text-base font-semibold tabular-nums'>
                    {formatQuota(overview?.pending_reward_quota ?? 0)}
                  </p>
                </div>
                <Button
                  onClick={handleTransfer}
                  disabled={
                    transferring ||
                    !canTransferAffiliateReward(
                      overview?.pending_reward_quota ?? 0
                    )
                  }
                >
                  <ArrowRightLeft />
                  {t('Transfer to Balance')}
                </Button>
                <div className='text-right'>
                  <p className='text-muted-foreground flex items-center justify-end gap-1 text-xs'>
                    <Wallet className='size-3.5' />
                    {t('Current Balance')}
                  </p>
                  <p className='text-base font-semibold tabular-nums'>
                    {formatQuota(user?.quota ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Settlement Rules')}</CardTitle>
            <CardDescription>
              {t('Daily settlement starts from the configured launch time.')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <RuleItem
              icon={Share2}
              title={t('Continuous usage rebate')}
              description={t(
                'Rebate is calculated from invited users actual consumed quota, including subscription usage.'
              )}
            />
            <RuleItem
              icon={CalendarDays}
              title={t('No historical backfill')}
              description={t(
                'Only usage after the configured start time participates in settlement.'
              )}
            />
            <RuleItem
              icon={Info}
              title={t('Small amounts are ignored')}
              description={t(
                'Single-day rebate below {{amount}} will not be settled',
                { amount: formatQuota(overview?.min_settlement_quota ?? 0) }
              )}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <CardTitle>{t('Invited Users')}</CardTitle>
              <CardDescription>
                {t(
                  'View invited users, today usage, tomorrow estimated rebate, and settled rewards.'
                )}
              </CardDescription>
            </div>
            <div className='bg-muted/40 flex rounded-lg border p-1'>
              <Button
                size='sm'
                variant={filter === 'all' ? 'default' : 'ghost'}
                onClick={() => setFilter('all')}
              >
                {t('All')}
              </Button>
              <Button
                size='sm'
                variant={filter === 'active' ? 'default' : 'ghost'}
                onClick={() => setFilter('active')}
              >
                {t('Has usage today')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {overviewQuery.isLoading ? (
            <div className='space-y-2'>
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className='h-10 w-full' />
              ))}
            </div>
          ) : invitees.length === 0 ? (
            <div className='flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed text-center'>
              <Users className='text-muted-foreground mb-3 size-8' />
              <p className='font-medium'>{t('No invited users yet')}</p>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t('Share your invite link to start earning rebates.')}
              </p>
            </div>
          ) : (
            <div className='max-h-[500px] overflow-y-auto rounded-xl border'>
              <Table>
                <TableHeader className='bg-muted/60 sticky top-0 z-10'>
                  <TableRow>
                    <TableHead>{t('Username')}</TableHead>
                    <TableHead>{t('Registered At')}</TableHead>
                    <TableHead>{t('Today Usage')}</TableHead>
                    <TableHead>{t('Tomorrow Estimated Rebate')}</TableHead>
                    <TableHead>{t('Settled Rebate')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitees.map((invitee) => (
                    <TableRow
                      key={invitee.user_id}
                      className='cursor-pointer'
                      onClick={() => setSelectedInvitee(invitee)}
                    >
                      <TableCell>
                        <div className='font-medium'>
                          {invitee.display_name || invitee.username}
                        </div>
                        <div className='text-muted-foreground text-xs'>
                          @{invitee.username}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatTimestampToDate(invitee.registered_at)}
                      </TableCell>
                      <TableCell>
                        {formatQuota(invitee.today_consumed_quota)}
                      </TableCell>
                      <TableCell className='font-medium'>
                        {formatQuota(invitee.tomorrow_reward_quota)}
                      </TableCell>
                      <TableCell>
                        {formatQuota(invitee.total_reward_quota)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(invitee.status)}>
                          {t(invitee.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <InviteeDetailSheet
        invitee={selectedInvitee}
        rows={settlementsQuery.data?.data ?? []}
        loading={settlementsQuery.isLoading}
        open={selectedInvitee != null}
        onOpenChange={(open) => {
          if (!open) setSelectedInvitee(null)
        }}
      />
      <SettledRebateDialog
        open={settledDialogOpen}
        rows={dailySettlementsQuery.data?.data ?? []}
        loading={dailySettlementsQuery.isLoading}
        onOpenChange={setSettledDialogOpen}
      />
      <ShareCopyDialog
        open={shareDialogOpen}
        message={shareMessage}
        onOpenChange={setShareDialogOpen}
        onRegenerate={generateShareMessage}
        onCopy={handleCopyShareMessage}
      />
    </div>
  )
}

function MetricCard(props: {
  label: string
  value: string
  icon: ElementType
  hint?: string
  onClick?: () => void
}) {
  const Icon = props.icon
  const content = (
    <>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-muted-foreground text-xs'>{props.label}</p>
        <div className='flex items-center gap-1'>
          {props.hint ? (
            <span className='text-muted-foreground text-[11px] font-medium'>
              {props.hint}
            </span>
          ) : null}
          <Icon className='text-primary size-4' />
          {props.onClick ? (
            <ChevronRight className='text-muted-foreground size-3.5' />
          ) : null}
        </div>
      </div>
      <p className='mt-2 truncate text-xl font-semibold tabular-nums'>
        {props.value}
      </p>
    </>
  )
  if (props.onClick) {
    return (
      <button
        type='button'
        className='bg-background/70 hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-ring w-full rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none'
        onClick={props.onClick}
      >
        {content}
      </button>
    )
  }
  return (
    <div className='bg-background/70 rounded-xl border p-3'>
      {content}
    </div>
  )
}

function RuleItem(props: {
  icon: ElementType
  title: string
  description: string
}) {
  const Icon = props.icon
  return (
    <div className='bg-background/60 flex gap-3 rounded-xl border p-3'>
      <div className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
        <Icon className='size-4' />
      </div>
      <div className='min-w-0'>
        <p className='text-sm font-medium'>{props.title}</p>
        <p className='text-muted-foreground mt-0.5 text-xs'>
          {props.description}
        </p>
      </div>
    </div>
  )
}

function InviteeDetailSheet(props: {
  invitee: AffiliateInviteeSummary | null
  rows: AffiliateRebateSettlement[]
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const trendRows = buildAffiliateRebateTrend(props.rows)
  const maxReward = Math.max(0, ...trendRows.map((row) => row.rewardQuota))

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className='w-[92vw] sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>{t('Invitee Rebate Detail')}</SheetTitle>
          <SheetDescription>
            {props.invitee?.display_name || props.invitee?.username || '-'}
          </SheetDescription>
        </SheetHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4'>
          {props.invitee ? (
            <div className='grid grid-cols-2 gap-3'>
              <MetricMini
                label={t('Today Usage')}
                value={formatQuota(props.invitee.today_consumed_quota)}
              />
              <MetricMini
                label={t('Tomorrow Estimated Rebate')}
                value={formatQuota(props.invitee.tomorrow_reward_quota)}
              />
              <MetricMini
                label={t('Settled Rebate')}
                value={formatQuota(props.invitee.total_reward_quota)}
              />
              <MetricMini
                label={t('Registered At')}
                value={formatTimestampToDate(props.invitee.registered_at)}
              />
            </div>
          ) : null}

          <div className='rounded-xl border p-3'>
            <div className='mb-3 flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium'>
                  {t('Last 7 Days Rebate Trend')}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t('Shows settled rebate amount, not invited user usage.')}
                </p>
              </div>
              <TrendingUp className='text-primary size-4' />
            </div>
            {props.loading ? (
              <Skeleton className='h-32 w-full' />
            ) : (
              <div className='from-muted/30 to-background/70 relative flex h-40 items-end gap-2 overflow-hidden rounded-lg border bg-gradient-to-b px-3 pt-5 pb-3'>
                <div className='border-border/50 pointer-events-none absolute inset-x-3 top-5 bottom-9 flex flex-col justify-between'>
                  <span className='border-border/60 border-t' />
                  <span className='border-border/40 border-t' />
                  <span className='border-border/40 border-t' />
                </div>
                {trendRows.map((row) => {
                  const height = getAffiliateRebateTrendBarHeight(
                    row.rewardQuota,
                    maxReward
                  )
                  return (
                    <div
                      key={row.date}
                      className='relative flex min-w-0 flex-1 flex-col items-center gap-2'
                    >
                      <div className='text-[10px] font-medium tabular-nums'>
                        {formatQuotaPlain(row.rewardQuota)}
                      </div>
                      <div className='flex h-24 w-full items-end'>
                        <div
                          className={cn(
                            'w-full rounded-t-md transition-all duration-200',
                            row.rewardQuota > 0
                              ? 'from-primary/75 to-primary/35 hover:from-primary hover:to-primary/60 bg-gradient-to-t shadow-sm'
                              : 'bg-muted-foreground/20'
                          )}
                          style={{
                            height:
                              row.rewardQuota > 0 ? `${height}%` : '4px',
                          }}
                        />
                      </div>
                      <div className='text-muted-foreground truncate text-[10px]'>
                        {row.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className='rounded-xl border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Settlement Date')}</TableHead>
                  <TableHead>{t('Consumed')}</TableHead>
                  <TableHead>{t('Rebate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className='text-muted-foreground h-20 text-center'
                    >
                      {t('No settlement records yet')}
                    </TableCell>
                  </TableRow>
                ) : (
                  props.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.settlement_date}</TableCell>
                      <TableCell>{formatQuota(row.consumed_quota)}</TableCell>
                      <TableCell className='font-medium'>
                        {formatQuota(row.reward_quota)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SettledRebateDialog(props: {
  open: boolean
  rows: AffiliateRebateDailySettlement[]
  loading: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[82vh] overflow-hidden sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Settled rebate records')}</DialogTitle>
          <DialogDescription>
            {t('Showing settled rebate records from the last 30 days.')}
          </DialogDescription>
        </DialogHeader>

        <div className='max-h-[56vh] overflow-y-auto rounded-xl border'>
          <Table>
            <TableHeader className='bg-muted/60 sticky top-0 z-10'>
              <TableRow>
                <TableHead>{t('Settlement Date')}</TableHead>
                <TableHead className='text-right'>{t('Rebate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={2}>
                      <Skeleton className='h-6 w-full' />
                    </TableCell>
                  </TableRow>
                ))
              ) : props.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className='text-muted-foreground h-24 text-center'
                  >
                    {t('No settlement records yet')}
                  </TableCell>
                </TableRow>
              ) : (
                props.rows.map((row) => (
                  <TableRow key={row.settlement_date}>
                    <TableCell>{row.settlement_date}</TableCell>
                    <TableCell className='text-right font-medium tabular-nums'>
                      {formatQuota(row.reward_quota)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ShareCopyDialog(props: {
  open: boolean
  message: string
  onOpenChange: (open: boolean) => void
  onRegenerate: () => void
  onCopy: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Share copy')}</DialogTitle>
          <DialogDescription>
            {t('Generated invitation copy can be sent directly to friends.')}
          </DialogDescription>
        </DialogHeader>

        <div className='bg-muted/30 rounded-xl border p-4 text-sm leading-7 sm:text-base'>
          {props.message}
        </div>

        <div className='flex flex-col gap-2 sm:flex-row sm:justify-end'>
          <Button variant='outline' onClick={props.onRegenerate}>
            <RefreshCw />
            {t('Try another one')}
          </Button>
          <Button onClick={props.onCopy} disabled={!props.message}>
            <Copy />
            {t('Copy share copy')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MetricMini(props: { label: string; value: string }) {
  return (
    <div className='bg-muted/30 rounded-xl border p-3'>
      <p className='text-muted-foreground text-xs'>{props.label}</p>
      <p className='mt-1 truncate text-sm font-semibold tabular-nums'>
        {props.value}
      </p>
    </div>
  )
}
