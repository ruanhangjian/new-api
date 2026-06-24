import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, RotateCw, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionPageLayout } from '@/components/layout'
import {
  channelStatusQueryKey,
  getChannelStatusDetail,
  listChannelStatus,
} from './api'
import type { UserChannelStatus, UserChannelStatusDetail } from './types'
import {
  MetricIcon,
  ProviderBadge,
  StatusBadge,
  buildTimelineBars,
  formatAvailability,
  formatLatency,
  getAvailabilityColor,
  getProviderIcon,
} from './utils'

type WindowDays = 7 | 15 | 30

function getWindowAvailability(item: UserChannelStatus, days: WindowDays) {
  if (days === 30) return item.availability_30d
  if (days === 15) return item.availability_15d
  return item.availability_7d
}

function getOverallStatus(
  items: UserChannelStatus[]
): 'operational' | 'degraded' {
  const hasBadStatus = items.some(
    (item) =>
      item.primary_status === 'failed' || item.primary_status === 'error'
  )
  return hasBadStatus ? 'degraded' : 'operational'
}

function ChannelTimeline({
  points,
  countdown,
}: {
  points: UserChannelStatus['timeline']
  countdown: number
}) {
  const bars = useMemo(() => buildTimelineBars(points), [points])
  const { t } = useTranslation()

  return (
    <div className='mt-4 border-t pt-3'>
      <div className='text-muted-foreground mb-2 flex justify-between text-[10px] font-semibold tracking-widest uppercase'>
        <span>{t('Recent 60 records')}</span>
        <span className='tabular-nums'>
          {t('Auto refresh: {{seconds}}s', { seconds: countdown })}
        </span>
      </div>
      <div className='flex h-5 w-full items-end gap-[2px]'>
        {bars.map((bar, index) => (
          <div
            key={`${bar.point?.checked_at || 'empty'}-${index}`}
            className={`min-w-[3px] flex-1 rounded-sm ${bar.className}`}
            style={{ height: `${bar.heightPercent}%` }}
            title={bar.title || undefined}
          />
        ))}
      </div>
      <div className='text-muted-foreground mt-1 flex justify-between text-[9px] tracking-widest uppercase'>
        <span>{t('PAST')}</span>
        <span>{t('NOW')}</span>
      </div>
    </div>
  )
}

function ChannelStatusCard({
  item,
  windowDays,
  countdown,
  onOpen,
}: {
  item: UserChannelStatus
  windowDays: WindowDays
  countdown: number
  onOpen: (item: UserChannelStatus) => void
}) {
  const { t } = useTranslation()
  const availability = getWindowAvailability(item, windowDays)
  const availabilityText = formatAvailability(availability)
  const availabilityValue = availabilityText.endsWith('%')
    ? availabilityText.slice(0, -1)
    : availabilityText
  const availabilitySuffix = availabilityText.endsWith('%') ? '%' : ''
  return (
    <button
      type='button'
      onClick={() => onOpen(item)}
      className='h-full w-full text-left'
    >
      <Card className='group border-border/80 bg-card/90 hover:border-primary/30 dark:bg-card/70 dark:hover:border-primary/30 dark:hover:shadow-primary/5 h-full min-h-[280px] gap-0 overflow-hidden p-5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_10px_40px_rgba(15,23,42,0.08)]'>
        <div className='flex items-start gap-3'>
          <div className='flex min-w-0 items-start gap-3'>
            <div className='ring-foreground/10 flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1'>
              {getProviderIcon(item.provider, 20)}
            </div>
            <div className='min-w-0'>
              <div className='truncate text-base font-semibold'>
                {item.name}
              </div>
              <div className='mt-0.5 flex min-w-0 items-center gap-1.5'>
                <ProviderBadge
                  provider={item.provider}
                  className='text-[10px]'
                />
                <span className='text-muted-foreground truncate font-mono text-xs'>
                  {item.primary_model}
                </span>
                {item.group_name && (
                  <span className='bg-muted text-muted-foreground inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[10px] font-medium'>
                    {item.group_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <StatusBadge
            status={item.primary_status}
            className='ml-auto shrink-0 px-2.5'
          />
        </div>

        <div className='mt-5 grid grid-cols-2 gap-2'>
          <div className='border-border/70 bg-muted/30 rounded-xl border p-3'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase'>
              <MetricIcon type='latency' />
              {t('Chat latency')}
            </div>
            <div className='mt-1.5 font-mono text-lg font-bold tabular-nums'>
              {formatLatency(item.primary_latency_ms)}
            </div>
          </div>
          <div className='border-border/70 bg-muted/30 rounded-xl border p-3'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase'>
              <MetricIcon type='ping' />
              {t('Endpoint PING')}
            </div>
            <div className='mt-1.5 font-mono text-lg font-bold tabular-nums'>
              {formatLatency(item.primary_ping_latency_ms)}
            </div>
          </div>
        </div>

        <div className='border-border/70 mt-4 border-t' />
        <div className='mt-3 flex items-end justify-between'>
          <div className='text-muted-foreground text-sm'>
            {t('Availability')} · {t('{{days}} days', { days: windowDays })}
            {item.extra_models.length > 0 && (
              <div className='mt-1 text-xs'>
                + {item.extra_models.length} {t('Extra models')}
              </div>
            )}
          </div>
          <div
            className='font-mono text-3xl leading-none font-bold tabular-nums'
            style={{ color: getAvailabilityColor(availability) }}
          >
            {availabilityValue}
            <span className='ml-0.5 text-base font-semibold'>
              {availabilitySuffix}
            </span>
          </div>
        </div>
        <ChannelTimeline points={item.timeline} countdown={countdown} />
      </Card>
    </button>
  )
}

function DetailSheet({
  item,
  open,
  onOpenChange,
}: {
  item: UserChannelStatus | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const detailQuery = useQuery({
    queryKey: [...channelStatusQueryKey, item?.id, 'detail'],
    queryFn: () => getChannelStatusDetail(item!.id),
    enabled: Boolean(item && open),
  })
  const detail = detailQuery.data?.data as UserChannelStatusDetail | undefined

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full p-0 sm:max-w-2xl'>
        <SheetHeader className='border-b p-5'>
          <SheetTitle>{item?.name || t('Channel status detail')}</SheetTitle>
          <SheetDescription>
            {t('Model availability and latency by time window')}
          </SheetDescription>
        </SheetHeader>
        <div className='p-5'>
          <div className='mb-5 flex items-center gap-3'>
            <div className='flex size-11 items-center justify-center rounded-xl bg-emerald-500/10'>
              {getProviderIcon(item?.provider || 'openai', 24)}
            </div>
            <div>
              <div className='font-medium'>{item?.primary_model}</div>
              <div className='text-muted-foreground text-sm'>
                {item?.group_name}
              </div>
            </div>
          </div>
          <div className='overflow-hidden rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('7 Days')}</TableHead>
                  <TableHead>{t('15 Days')}</TableHead>
                  <TableHead>{t('30 Days')}</TableHead>
                  <TableHead>{t('Avg Latency')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail?.models.map((model) => (
                  <TableRow key={model.model}>
                    <TableCell className='font-medium'>{model.model}</TableCell>
                    <TableCell>
                      <StatusBadge status={model.latest_status} />
                    </TableCell>
                    <TableCell>
                      {formatAvailability(model.availability_7d)}
                    </TableCell>
                    <TableCell>
                      {formatAvailability(model.availability_15d)}
                    </TableCell>
                    <TableCell>
                      {formatAvailability(model.availability_30d)}
                    </TableCell>
                    <TableCell>
                      {formatLatency(model.avg_latency_7d_ms)}
                    </TableCell>
                  </TableRow>
                ))}
                {!detail?.models.length && (
                  <TableRow>
                    <TableCell colSpan={6} className='h-24 text-center'>
                      {detailQuery.isLoading ? t('Loading...') : t('No data')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ChannelStatusPage() {
  const { t } = useTranslation()
  const [windowDays, setWindowDays] = useState<WindowDays>(7)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [countdown, setCountdown] = useState(60)
  const [selected, setSelected] = useState<UserChannelStatus | null>(null)

  const statusQuery = useQuery({
    queryKey: channelStatusQueryKey,
    queryFn: listChannelStatus,
    refetchInterval: autoRefresh ? 60_000 : false,
  })
  const items = statusQuery.data?.data || []
  const overall = getOverallStatus(items)

  useEffect(() => {
    if (!autoRefresh) return
    setCountdown(60)
    const timer = window.setInterval(() => {
      setCountdown((value) => (value <= 1 ? 60 : value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, statusQuery.dataUpdatedAt])

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Channel Status')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('View upstream channel availability, latency, and recent status')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <Tabs
          value={String(windowDays)}
          onValueChange={(value) => setWindowDays(Number(value) as WindowDays)}
        >
          <TabsList>
            <TabsTrigger value='7'>
              {t('{{days}} days', { days: 7 })}
            </TabsTrigger>
            <TabsTrigger value='15'>
              {t('{{days}} days', { days: 15 })}
            </TabsTrigger>
            <TabsTrigger value='30'>
              {t('{{days}} days', { days: 30 })}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Badge className='h-8 gap-2 rounded-full px-3' variant='outline'>
          <span
            className={`size-2 rounded-full ${
              overall === 'operational' ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          {overall === 'operational' ? 'OPERATIONAL' : 'DEGRADED'}
        </Badge>
        <Button
          variant='outline'
          size='icon'
          onClick={async () => {
            await statusQuery.refetch()
            toast.success(t('Refreshed'))
          }}
          disabled={statusQuery.isFetching}
        >
          <RefreshCw
            className={`size-4 ${statusQuery.isFetching ? 'animate-spin' : ''}`}
          />
        </Button>
        <Button
          variant='outline'
          onClick={() => setAutoRefresh((value) => !value)}
        >
          <RotateCw className='size-4' />
          {autoRefresh
            ? t('Auto refresh: {{seconds}}s', { seconds: countdown })
            : t('Auto refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        {items.length ? (
          <div className='grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3'>
            {items.map((item) => (
              <ChannelStatusCard
                key={item.id}
                item={item}
                windowDays={windowDays}
                countdown={countdown}
                onOpen={setSelected}
              />
            ))}
          </div>
        ) : (
          <Card className='flex min-h-64 items-center justify-center'>
            <div className='text-center'>
              <div className='bg-muted mx-auto flex size-12 items-center justify-center rounded-full'>
                <Wifi className='text-muted-foreground size-6' />
              </div>
              <div className='mt-4 font-medium'>
                {statusQuery.isLoading
                  ? t('Loading...')
                  : t('No channel status')}
              </div>
              <div className='text-muted-foreground mt-1 text-sm'>
                {t('Enabled channel monitors will appear here.')}
              </div>
            </div>
          </Card>
        )}
      </SectionPageLayout.Content>
      <DetailSheet
        item={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </SectionPageLayout>
  )
}
