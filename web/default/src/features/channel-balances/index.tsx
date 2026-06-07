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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Search, Settings2, Trash2, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SectionPageLayout } from '@/components/layout'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatTimestampToDate } from '@/lib/format'
import {
  channelBalancesQueryKey,
  createChannelBalanceAccount,
  deleteChannelBalanceAccount,
  getChannelBalanceOverview,
  refreshAllChannelBalances,
  refreshChannelBalance,
  updateChannelBalanceAccount,
  updateChannelBalanceSettings,
} from './api'
import type {
  ChannelBalanceAccount,
  ChannelBalanceAccountPayload,
  ChannelBalanceAccountType,
} from './types'
import {
  getChannelBalanceActiveRefreshMs,
  getChannelBalancePageRefreshMs,
} from './auto-refresh'

type AccountFormState = {
  name: string
  type: ChannelBalanceAccountType
  base_url: string
  recharge_url: string
  upstream_user_id: string
  key: string
  enabled: boolean
  threshold: string
  alert_enabled: boolean
  alert_cooldown_hours: string
  remark: string
}

const accountTypeOptions: Array<{
  value: ChannelBalanceAccountType
  label: string
}> = [
  { value: 'newapi', label: 'NewAPI' },
  { value: 'sub2api', label: 'Sub2API' },
]

const emptyForm: AccountFormState = {
  name: '',
  type: 'sub2api',
  base_url: '',
  recharge_url: '',
  upstream_user_id: '',
  key: '',
  enabled: true,
  threshold: '0',
  alert_enabled: false,
  alert_cooldown_hours: '24',
  remark: '',
}

function formatBalance(value: number, unit: string) {
  return `${value.toFixed(4)} ${unit || 'USD'}`
}

function buildEditState(account: ChannelBalanceAccount): AccountFormState {
  return {
    name: account.name,
    type: account.type || 'sub2api',
    base_url: account.base_url,
    recharge_url: account.recharge_url || '',
    upstream_user_id: account.upstream_user_id
      ? String(account.upstream_user_id)
      : '',
    key: '',
    enabled: account.enabled,
    threshold: String(account.threshold || 0),
    alert_enabled: account.alert_enabled,
    alert_cooldown_hours: String(account.alert_cooldown_hours || 24),
    remark: account.remark || '',
  }
}

function buildPayload(form: AccountFormState, isEdit: boolean): ChannelBalanceAccountPayload {
  const payload: ChannelBalanceAccountPayload = {
    name: form.name.trim(),
    type: form.type,
    base_url: form.base_url.trim(),
    recharge_url: form.recharge_url.trim(),
    upstream_user_id:
      form.type === 'newapi' ? Number(form.upstream_user_id) || 0 : undefined,
    enabled: form.enabled,
    threshold: Number(form.threshold) || 0,
    alert_enabled: form.alert_enabled,
    alert_cooldown_hours: Number(form.alert_cooldown_hours) || 24,
    remark: form.remark.trim(),
  }
  const key = form.key.trim()
  if (key || !isEdit) {
    payload.key = key
  }
  return payload
}

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string
  value: string | number
  description: string
}) {
  return (
    <Card size='sm'>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className='text-2xl'>{value}</CardTitle>
      </CardHeader>
      <CardContent className='text-muted-foreground text-xs'>
        {description}
      </CardContent>
    </Card>
  )
}

function AccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: ChannelBalanceAccount | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = Boolean(account)
  const [form, setForm] = useState<AccountFormState>(emptyForm)

  useEffect(() => {
    setForm(account ? buildEditState(account) : emptyForm)
  }, [account, open])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (account) {
        return updateChannelBalanceAccount(account.id, buildPayload(form, true))
      }
      return createChannelBalanceAccount(buildPayload(form, false))
    },
    onSuccess: async (response) => {
      if (response.success) {
        toast.success(t('Saved successfully'))
        await queryClient.invalidateQueries({ queryKey: channelBalancesQueryKey })
        onOpenChange(false)
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('Edit upstream account') : t('Add upstream account')}
          </DialogTitle>
          <DialogDescription>
            {t('One upstream balance account can be shared by multiple channel IP entries.')}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4'>
          <div className='grid gap-2 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('Name')}</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={t('e.g. Main Sub2API account')}
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('Upstream type')}</Label>
              <Select<ChannelBalanceAccountType>
                items={accountTypeOptions}
                value={form.type}
                onValueChange={(value) => {
                  if (!value) return
                  setForm({ ...form, type: value })
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {accountTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='grid gap-2'>
            <Label>{t('Base URL')}</Label>
            <Input
              value={form.base_url}
              onChange={(event) =>
                setForm({ ...form, base_url: event.target.value })
              }
              placeholder='https://api.example.com'
            />
          </div>

          <div className='grid gap-2'>
            <Label>{t('Recharge URL')}</Label>
            <Input
              value={form.recharge_url}
              onChange={(event) =>
                setForm({ ...form, recharge_url: event.target.value })
              }
              placeholder='https://billing.example.com/topup'
            />
            <p className='text-muted-foreground text-xs'>
              {t('Optional recharge link used in low-balance alert emails')}
            </p>
          </div>

          {form.type === 'newapi' ? (
            <div className='grid gap-2'>
              <Label>{t('NewAPI user ID')}</Label>
              <Input
                type='number'
                min='1'
                step='1'
                value={form.upstream_user_id}
                onChange={(event) =>
                  setForm({ ...form, upstream_user_id: event.target.value })
                }
                placeholder='1'
              />
              <p className='text-muted-foreground text-xs'>
                {t('Required for reading the upstream NewAPI wallet balance')}
              </p>
            </div>
          ) : null}

          <div className='grid gap-2'>
            <Label>
              {form.type === 'newapi' ? t('System access token') : t('API Key')}
            </Label>
            <Input
              type='password'
              value={form.key}
              onChange={(event) => setForm({ ...form, key: event.target.value })}
              placeholder={
                isEdit
                  ? t('Leave empty to keep the existing key')
                  : form.type === 'newapi'
                    ? t('Enter NewAPI system access token')
                    : t('Enter upstream API key')
              }
            />
            {form.type === 'newapi' ? (
              <p className='text-muted-foreground text-xs'>
                {t('For NewAPI, use the system access token, not a model API key')}
              </p>
            ) : null}
          </div>

          <div className='grid gap-2 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('Alert threshold')}</Label>
              <Input
                type='number'
                min='0'
                step='0.0001'
                value={form.threshold}
                onChange={(event) =>
                  setForm({ ...form, threshold: event.target.value })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('Cooldown hours')}</Label>
              <Input
                type='number'
                min='1'
                step='1'
                value={form.alert_cooldown_hours}
                onChange={(event) =>
                  setForm({
                    ...form,
                    alert_cooldown_hours: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className='grid gap-2 sm:grid-cols-2'>
            <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
              <div className='space-y-1'>
                <Label>{t('Enable monitor')}</Label>
                <p className='text-muted-foreground text-xs'>
                  {t('Include this account when refreshing monitored balances')}
                </p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
              />
            </div>
            <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
              <div className='space-y-1'>
                <Label>{t('Email alert')}</Label>
                <p className='text-muted-foreground text-xs'>
                  {t('Notify root user when balance drops below the threshold')}
                </p>
              </div>
              <Switch
                checked={form.alert_enabled}
                onCheckedChange={(checked) =>
                  setForm({ ...form, alert_enabled: checked })
                }
              />
            </div>
          </div>

          <div className='grid gap-2'>
            <Label>{t('Remark')}</Label>
            <Textarea
              value={form.remark}
              onChange={(event) => setForm({ ...form, remark: event.target.value })}
              placeholder={t('Optional notes, such as related channel IPs')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ChannelBalances() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [dialogAccount, setDialogAccount] = useState<ChannelBalanceAccount | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteAccount, setDeleteAccount] = useState<ChannelBalanceAccount | null>(null)
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState('0')
  const autoRefreshingRef = useRef(false)

  const { data, error, isError, isLoading, isFetching, refetch } = useQuery({
    queryKey: channelBalancesQueryKey,
    queryFn: getChannelBalanceOverview,
  })

  const overview = data?.data
  const savedAutoRefreshMinutes = overview?.settings?.auto_refresh_minutes || 0

  useEffect(() => {
    const refreshMs = getChannelBalancePageRefreshMs(savedAutoRefreshMinutes)
    if (refreshMs <= 0) return

    const timer = window.setInterval(() => {
      void refetch()
    }, refreshMs)

    return () => window.clearInterval(timer)
  }, [refetch, savedAutoRefreshMinutes])

  useEffect(() => {
    const refreshMs = getChannelBalanceActiveRefreshMs(savedAutoRefreshMinutes)
    if (refreshMs <= 0) return

    const refreshBalances = async () => {
      if (autoRefreshingRef.current) return
      autoRefreshingRef.current = true
      try {
        await refreshAllChannelBalances()
        await queryClient.invalidateQueries({ queryKey: channelBalancesQueryKey })
      } catch {
        await queryClient.invalidateQueries({ queryKey: channelBalancesQueryKey })
      } finally {
        autoRefreshingRef.current = false
      }
    }

    const timer = window.setInterval(() => {
      void refreshBalances()
    }, refreshMs)

    return () => window.clearInterval(timer)
  }, [queryClient, savedAutoRefreshMinutes])

  useEffect(() => {
    if (overview?.settings) {
      setAutoRefreshMinutes(String(overview.settings.auto_refresh_minutes || 0))
    }
  }, [overview?.settings])

  const accounts = overview?.items || []
  const filteredAccounts = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((account) =>
      [account.name, account.type, account.base_url, account.remark]
        .concat(account.recharge_url || '')
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [accounts, keyword])

  const refreshOneMutation = useMutation({
    mutationFn: refreshChannelBalance,
    onSuccess: async (response) => {
      if (response.success) {
        toast.success(t('Balance updated successfully'))
        await queryClient.invalidateQueries({ queryKey: channelBalancesQueryKey })
      }
    },
  })

  const refreshAllMutation = useMutation({
    mutationFn: refreshAllChannelBalances,
    onSuccess: async (response) => {
      if (response.success) {
        const failed = response.data?.filter((item) => !item.success).length || 0
        if (failed > 0) {
          toast.warning(t('{{count}} account(s) failed to refresh', { count: failed }))
        } else {
          toast.success(t('Balance updated successfully'))
        }
        await queryClient.invalidateQueries({ queryKey: channelBalancesQueryKey })
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChannelBalanceAccount,
    onSuccess: async (response) => {
      if (response.success) {
        toast.success(t('Deleted successfully'))
        setDeleteAccount(null)
        await queryClient.invalidateQueries({ queryKey: channelBalancesQueryKey })
      }
    },
  })

  const settingsMutation = useMutation({
    mutationFn: updateChannelBalanceSettings,
    onSuccess: async (response) => {
      if (response.success) {
        toast.success(t('Saved successfully'))
        await queryClient.invalidateQueries({ queryKey: channelBalancesQueryKey })
      }
    },
  })

  const summary = overview?.summary
  const loadErrorMessage =
    error instanceof Error ? error.message : t('Failed to load channel balances')

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Channel Balances')}</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Monitor upstream account balances and low-balance email alerts')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <div className='flex items-center gap-2'>
            <Button
              onClick={() => {
                setDialogAccount(null)
                setDialogOpen(true)
              }}
            >
              <Plus />
              {t('Add upstream account')}
            </Button>
            <Button
              variant='outline'
              onClick={() => refreshAllMutation.mutate()}
              disabled={refreshAllMutation.isPending || isError}
            >
              <RefreshCw
                className={refreshAllMutation.isPending ? 'animate-spin' : ''}
              />
              {t('Refresh monitored')}
            </Button>
          </div>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          {isError ? (
            <Alert variant='destructive' className='mb-4'>
              <AlertDescription>
                {t(
                  'Failed to load channel balances. Please make sure the backend has been restarted with the latest code.'
                )}
                <span className='mt-1 block text-xs opacity-80'>
                  {loadErrorMessage}
                </span>
              </AlertDescription>
            </Alert>
          ) : null}

          {summary?.low_balance ? (
            <Alert variant='destructive' className='mb-4'>
              <WalletCards className='h-4 w-4' />
              <AlertDescription>
                {t('{{count}} monitored account(s) are below threshold', {
                  count: summary.low_balance,
                })}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className='mb-4 flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between'>
            <div className='grid gap-2 sm:max-w-xs'>
              <Label>{t('Auto refresh interval')}</Label>
              <Input
                type='number'
                min='0'
                max='10080'
                step='1'
                value={autoRefreshMinutes}
                onChange={(event) => setAutoRefreshMinutes(event.target.value)}
              />
              <p className='text-muted-foreground text-xs'>
                {t('Set to 0 to disable automatic refresh. Unit: minutes.')}
              </p>
            </div>
            <Button
              variant='outline'
              disabled={settingsMutation.isPending}
              onClick={() =>
                settingsMutation.mutate({
                  auto_refresh_minutes: Math.max(
                    0,
                    Number(autoRefreshMinutes) || 0
                  ),
                })
              }
            >
              {settingsMutation.isPending ? t('Saving...') : t('Save settings')}
            </Button>
          </div>

          <div className='mb-4 grid gap-3 md:grid-cols-4'>
            <SummaryCard
              title={t('Total accounts')}
              value={summary?.total || 0}
              description={t('All configured upstream balance accounts')}
            />
            <SummaryCard
              title={t('Monitored')}
              value={summary?.monitored || 0}
              description={t('Included in batch balance refresh')}
            />
            <SummaryCard
              title={t('Low balance')}
              value={summary?.low_balance || 0}
              description={t('Balance is below configured threshold')}
            />
            <SummaryCard
              title={t('Last refresh')}
              value={
                summary?.last_refresh_time
                  ? formatTimestampToDate(summary.last_refresh_time)
                  : '-'
              }
              description={t('Latest successful upstream balance update')}
            />
          </div>

          <div className='mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div className='relative w-full sm:max-w-sm'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2' />
              <Input
                className='pl-8'
                placeholder={t('Search upstream accounts')}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
            <div className='text-muted-foreground text-sm'>
              {isLoading || isFetching
                ? t('Loading...')
                : t('{{count}} account(s)', { count: filteredAccounts.length })}
            </div>
          </div>

          <div className='overflow-hidden rounded-lg border bg-card'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Upstream account')}</TableHead>
                  <TableHead>{t('Base URL')}</TableHead>
                  <TableHead>{t('Balance')}</TableHead>
                  <TableHead>{t('Threshold')}</TableHead>
                  <TableHead>{t('Monitor')}</TableHead>
                  <TableHead>{t('Last updated')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className='text-muted-foreground h-32 text-center'
                    >
                      {isLoading ? t('Loading...') : t('No data')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className='min-w-44'>
                          <div className='font-medium'>{account.name}</div>
                          <div className='text-muted-foreground text-xs'>
                            #{account.id} · {account.type.toUpperCase()}
                            {account.type === 'newapi' && account.upstream_user_id
                              ? ` · UID ${account.upstream_user_id}`
                              : ''}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='max-w-80 truncate text-sm'>
                          {account.base_url}
                        </div>
                        {account.recharge_url ? (
                          <div className='text-muted-foreground mt-1 max-w-80 truncate text-xs'>
                            {t('Recharge URL')}: {account.recharge_url}
                          </div>
                        ) : null}
                        {account.remark ? (
                          <div className='text-muted-foreground mt-1 max-w-80 truncate text-xs'>
                            {account.remark}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={account.low_balance ? 'destructive' : 'secondary'}
                        >
                          {formatBalance(account.balance, account.unit)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {account.threshold > 0
                          ? formatBalance(account.threshold, account.unit)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-col gap-1'>
                          <Badge variant={account.enabled ? 'default' : 'outline'}>
                            {account.enabled ? t('Enabled') : t('Disabled')}
                          </Badge>
                          <span className='text-muted-foreground text-xs'>
                            {account.alert_enabled ? t('Alert on') : t('Alert off')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatTimestampToDate(account.balance_updated_time)}
                      </TableCell>
                      <TableCell>
                        <div className='flex justify-end gap-2'>
                          <Button
                            variant='outline'
                            size='icon-sm'
                            title={t('Refresh')}
                            disabled={refreshOneMutation.isPending}
                            onClick={() => refreshOneMutation.mutate(account.id)}
                          >
                            <RefreshCw
                              className={
                                refreshOneMutation.isPending ? 'animate-spin' : ''
                              }
                            />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            title={t('Settings')}
                            onClick={() => {
                              setDialogAccount(account)
                              setDialogOpen(true)
                            }}
                          >
                            <Settings2 />
                          </Button>
                          <Button
                            variant='destructive'
                            size='icon-sm'
                            title={t('Delete')}
                            onClick={() => setDeleteAccount(account)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <AccountDialog
        account={dialogAccount}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <ConfirmDialog
        open={Boolean(deleteAccount)}
        onOpenChange={(open) => {
          if (!open) setDeleteAccount(null)
        }}
        title={t('Delete upstream account')}
        desc={t('This will delete the upstream balance account. Continue?')}
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={() => {
          if (deleteAccount) deleteMutation.mutate(deleteAccount.id)
        }}
      />
    </>
  )
}
