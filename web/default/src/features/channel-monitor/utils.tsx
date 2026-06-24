import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'
import type {
  ChannelMonitorProvider,
  ChannelMonitorStatus,
  ChannelMonitorTimelinePoint,
} from './types'

export const providerOptions: Array<{
  value: ChannelMonitorProvider
  label: string
  icon: string
}> = [
  { value: 'openai', label: 'OpenAI', icon: 'OpenAI.Color' },
  { value: 'anthropic', label: 'Anthropic', icon: 'Claude.Color' },
  { value: 'gemini', label: 'Gemini', icon: 'Gemini.Color' },
]

export function getProviderLabel(provider: string) {
  return (
    providerOptions.find((item) => item.value === provider)?.label || provider
  )
}

export function getProviderIcon(provider: string, size = 22) {
  const iconName =
    providerOptions.find((item) => item.value === provider)?.icon ||
    'OpenAI.Color'
  return getLobeIcon(iconName, size)
}

export function getStatusLabelKey(status: ChannelMonitorStatus | '') {
  switch (status) {
    case 'operational':
      return 'Operational'
    case 'degraded':
      return 'Degraded'
    case 'failed':
      return 'Failed'
    case 'error':
      return 'Error'
    default:
      return 'Not checked'
  }
}

export function getStatusClassName(status: ChannelMonitorStatus | '') {
  switch (status) {
    case 'operational':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
    case 'degraded':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300'
    case 'failed':
      return 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-300'
    case 'error':
      return 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

export function getTimelineClassName(status: ChannelMonitorStatus | '') {
  switch (status) {
    case 'operational':
      return 'bg-emerald-500'
    case 'degraded':
      return 'bg-amber-500'
    case 'failed':
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-muted dark:bg-muted/50'
  }
}

export type TimelineBar = {
  status: ChannelMonitorStatus | 'empty'
  className: string
  heightPercent: number
  title: string
  point: ChannelMonitorTimelinePoint | null
}

const timelineHeightByStatus: Record<TimelineBar['status'], number> = {
  operational: 100,
  degraded: 65,
  failed: 35,
  error: 35,
  empty: 15,
}

export function buildTimelineBars(
  points: ChannelMonitorTimelinePoint[],
  length = 60
): TimelineBar[] {
  const normalizedLength = Math.max(1, length)
  const visible = [...points]
    .sort((left, right) => left.checked_at - right.checked_at)
    .slice(-normalizedLength)
  const missing = Math.max(0, normalizedLength - visible.length)
  const emptyBars = Array.from(
    { length: missing },
    (): TimelineBar => ({
      status: 'empty',
      className: getTimelineClassName(''),
      heightPercent: timelineHeightByStatus.empty,
      title: '',
      point: null,
    })
  )
  const dataBars = visible.map(
    (point): TimelineBar => ({
      status: point.status,
      className: getTimelineClassName(point.status),
      heightPercent:
        timelineHeightByStatus[point.status] ?? timelineHeightByStatus.empty,
      title: `${point.status} · ${point.latency_ms}ms`,
      point,
    })
  )
  return [...emptyBars, ...dataBars]
}

export function getAvailabilityColor(value: number) {
  const normalized = Math.max(0, Math.min(100, value || 0))
  const hue = normalized * 1.2
  return `hsl(${hue} 72% 42%)`
}

export function getStatusIcon(status: ChannelMonitorStatus | '') {
  switch (status) {
    case 'operational':
      return CheckCircle2
    case 'degraded':
      return AlertTriangle
    case 'failed':
      return CircleSlash
    case 'error':
      return AlertTriangle
    default:
      return Activity
  }
}

export function formatLatency(ms: number) {
  if (!ms) return '--'
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)} s`
  return `${ms} ms`
}

export function formatAvailability(value: number) {
  if (!value) return '0.0%'
  return `${value.toFixed(value >= 99 ? 2 : 1)}%`
}

export function StatusBadge({
  status,
  className,
}: {
  status: ChannelMonitorStatus | ''
  className?: string
}) {
  const { t } = useTranslation()
  const Icon = getStatusIcon(status)
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-semibold',
        getStatusClassName(status),
        className
      )}
    >
      <Icon className='size-3' />
      {t(getStatusLabelKey(status))}
    </span>
  )
}

export function ProviderBadge({
  provider,
  className,
}: {
  provider: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-md bg-emerald-500/10 px-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300',
        className
      )}
    >
      {getProviderLabel(provider)}
    </span>
  )
}

export function MetricIcon({ type }: { type: 'latency' | 'ping' }) {
  const Icon = type === 'latency' ? Zap : Activity
  return <Icon className='text-muted-foreground size-3.5' />
}
