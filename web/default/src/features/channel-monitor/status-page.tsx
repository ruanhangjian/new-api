import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, RotateCw, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SectionPageLayout } from '@/components/layout'
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
import {
  channelStatusQueryKey,
  getChannelStatusDetail,
  listChannelStatus,
} from './api'
import type {
  UserChannelStatus,
  UserChannelStatusDetail,
} from './types'
import {
  MetricIcon,
  ProviderBadge,
  StatusBadge,
  formatAvailability,
  formatLatency,
  getProviderIcon,
  getTimelineClassName,
} from './utils'

type WindowDays = 7 | 15 | 30

function getWindowAvailability(item: UserChannelStatus, days: WindowDays) {
  if (days === 30) return item.availability_30d
  if (days === 15) return item.availability_15d
  return item.availability_7d
}

function getOverallStatus(items: UserChannelStatus[]): 'operational' | 'degraded' {
  const hasBadStatus = items.some(
    (item) => item.primary_status === 'failed' || item.primary_status === 'error'
  )
  return hasBadStatus ? 'degraded' : 'operational'
}

function ChannelTimeline({
  points,
}: {
  points: UserChannelStatus['timeline']
}) {
  const normalized = useMemo(() => {
    const visible = points.slice(-60)
    const missing = Math.max(0, 60 - visible.length)
    return [
      ...Array.from({ length: missing }, () => null),
      ...visible,
    ] as Array<(typeof visible)[number] | null>
  }, [points])

  return (
    <div className='flex h-8 items-end gap-1'>
      {normalized.map((point, index) => (
        <div
          key={`${point?.checked_at || 'empty'}-${index}`}
          className={`h-7 w-1.5 rounded-full ${getTimelineClassName(point?.status || '')}`}
          title={point ? `${point.status} ${point.latency_ms}ms` : undefined}
        />
      ))}
    </div>
  )
}

function ChannelStatusCard({
  item,
  windowDays,
  onOpen,
}: {
  item: UserChannelStatus
  windowDays: WindowDays
  onOpen: (item: UserChannelStatus) => void
}) {
  const { t } = useTranslation()
  const availability = getWindowAvailability(item, windowDays)
  return (
    <button
      type='button'
      onClick={() => onOpen(item)}
      className='text-left'
    >
      <Card className='group h-full border-border/80 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:hover:shadow-primary/5'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex min-w-0 items-start gap-3'>
            <div className='flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500'>
              {getProviderIcon(item.provider, 26)}
            </div>
            <div className='min-w-0'>
              <div className='truncate text-lg font-semibold'>{item.name}</div>
              <div className='mt-1 flex min-w-0 items-center gap-2'>
                <ProviderBadge provider={item.provider} />
                <span className='text-muted-foreground truncate text-sm'>
                  {item.primary_model}
                </span>
              </div>
            </div>
          </div>
          <StatusBadge status={item.primary_status} />
        </div>

        <div className='mt-7 grid grid-cols-2 gap-3'>
          <div className='rounded-xl border bg-muted/20 p-4'>
            <div className='flex items-center gap-2 text-xs font-medium text-muted-foreground'>
              <MetricIcon type='latency' />
              {t('Chat latency')}
            </div>
            <div className='mt-3 text-2xl font-semibold tabular-nums'>
              {formatLatency(item.primary_latency_ms)}
            </div>
          </div>
          <div className='rounded-xl border bg-muted/20 p-4'>
            <div className='flex items-center gap-2 text-xs font-medium text-muted-foreground'>
              <MetricIcon type='ping' />
              {t('Endpoint PING')}
            </div>
            <div className='mt-3 text-2xl font-semibold tabular-nums'>
              {formatLatency(item.primary_ping_latency_ms)}
            </div>
          </div>
        </div>

        <div className='my-5 border-t' />
        <div className='flex items-end justify-between'>
          <div className='text-muted-foreground text-sm'>
            {t('Availability')} · {t('{{days}} days', { days: windowDays })}
          </div>
          <div className='text-4xl font-bold tracking-normal text-emerald-500 tabular-nums'>
            {formatAvailability(availability)}
          </div>
        </div>
        <div className='my-5 border-t' />
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>{t('Recent 60 records')}</span>
          <span>{t('Auto refresh')}</span>
        </div>
        <div className='mt-3'>
          <ChannelTimeline points={item.timeline} />
          <div className='mt-1 flex justify-between text-xs uppercase text-muted-foreground'>
            <span>{t('PAST')}</span>
            <span>{t('NOW')}</span>
          </div>
        </div>
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
              <div className='text-muted-foreground text-sm'>{item?.group_name}</div>
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
                    <TableCell>{formatAvailability(model.availability_7d)}</TableCell>
                    <TableCell>{formatAvailability(model.availability_15d)}</TableCell>
                    <TableCell>{formatAvailability(model.availability_30d)}</TableCell>
                    <TableCell>{formatLatency(model.avg_latency_7d_ms)}</TableCell>
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
            <TabsTrigger value='7'>{t('{{days}} days', { days: 7 })}</TabsTrigger>
            <TabsTrigger value='15'>{t('{{days}} days', { days: 15 })}</TabsTrigger>
            <TabsTrigger value='30'>{t('{{days}} days', { days: 30 })}</TabsTrigger>
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
          onClick={() => statusQuery.refetch()}
          disabled={statusQuery.isFetching}
        >
          <RefreshCw className='size-4' />
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
          <div className='grid grid-cols-1 gap-5 lg:grid-cols-3'>
            {items.map((item) => (
              <ChannelStatusCard
                key={item.id}
                item={item}
                windowDays={windowDays}
                onOpen={setSelected}
              />
            ))}
          </div>
        ) : (
          <Card className='flex min-h-64 items-center justify-center'>
            <div className='text-center'>
              <div className='mx-auto flex size-12 items-center justify-center rounded-full bg-muted'>
                <Wifi className='size-6 text-muted-foreground' />
              </div>
              <div className='mt-4 font-medium'>
                {statusQuery.isLoading ? t('Loading...') : t('No channel status')}
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
