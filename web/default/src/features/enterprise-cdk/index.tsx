import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Check,
  ChevronLeft,
  ClipboardList,
  Clock3,
  Copy,
  CreditCard,
  Download,
  FilePlus2,
  Info,
  Plus,
  ShieldAlert,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useStatus } from '@/hooks/use-status'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { DateTimePicker } from '@/components/datetime-picker'
import { Main, SectionPageLayout } from '@/components/layout'
import {
  copyEnterpriseCdkUnusedCodes,
  createEnterpriseCdkBatch,
  exportEnterpriseCdkCodes,
  getEnterpriseCdkBalance,
  getEnterpriseCdkBalanceLogs,
  getEnterpriseCdkBatchDetail,
  getEnterpriseCdkBatches,
  getEnterpriseCdkPermission,
} from './api'
import type { CreateEnterpriseCdkBatchInput, EnterpriseCdkBatch } from './types'
import {
  CDK_STATUS,
  ENTERPRISE_CDK_QUOTA_LOG_TYPE_OPTIONS,
  type EnterpriseCdkExpiryPreset,
  formatEnterpriseCdkQuotaLogType,
  formatQuota,
  formatSignedQuota,
  getCodeStatus,
  getEnterpriseCdkExpiryPresetDate,
} from './utils'

type EnterpriseCdkCreateForm = Omit<CreateEnterpriseCdkBatchInput, 'count'> & {
  count: string
}

const emptyForm: EnterpriseCdkCreateForm = {
  name: '',
  remark: '',
  quota: '',
  count: '',
  expired_time: 0,
}

export function EnterpriseCdkPage() {
  const queryClient = useQueryClient()
  const { status } = useStatus()
  const quotaPerUnit = status?.quota_per_unit
  const enterpriseCdkContactMessage =
    typeof status?.enterprise_cdk_contact_message === 'string' &&
    status.enterprise_cdk_contact_message.trim()
      ? status.enterprise_cdk_contact_message
      : '余额不足。如需充值，请联系管理员线下收款后授信。'
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<EnterpriseCdkCreateForm>(emptyForm)
  const [batchesPage, setBatchesPage] = useState(1)
  const [logsPage, setLogsPage] = useState(1)
  const [activeTab, setActiveTab] = useState<'batches' | 'logs'>('batches')
  const [batchKeyword, setBatchKeyword] = useState('')
  const [appliedBatchKeyword, setAppliedBatchKeyword] = useState('')
  const [logsType, setLogsType] = useState('all')
  const [nowSeconds, setNowSeconds] = useState(() =>
    Math.floor(Date.now() / 1000)
  )

  const permission = useQuery({
    queryKey: ['enterprise-cdk', 'permission'],
    queryFn: getEnterpriseCdkPermission,
    retry: false,
  })
  const balance = useQuery({
    queryKey: ['enterprise-cdk', 'balance'],
    queryFn: getEnterpriseCdkBalance,
    enabled: permission.data?.data?.has_permission === true,
  })
  const batches = useQuery({
    queryKey: ['enterprise-cdk', 'batches', batchesPage, appliedBatchKeyword],
    queryFn: () =>
      getEnterpriseCdkBatches({
        p: batchesPage,
        keyword: appliedBatchKeyword,
      }),
    enabled: permission.data?.data?.has_permission === true,
  })
  const logs = useQuery({
    queryKey: ['enterprise-cdk', 'balance-logs', logsPage, logsType],
    queryFn: () =>
      getEnterpriseCdkBalanceLogs({
        p: logsPage,
        type: logsType === 'all' ? '' : logsType,
      }),
    enabled: permission.data?.data?.has_permission === true,
  })

  const createMutation = useMutation({
    mutationFn: createEnterpriseCdkBatch,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success('CDK 批次已创建')
      setCreateOpen(false)
      setForm(emptyForm)
      queryClient.invalidateQueries({ queryKey: ['enterprise-cdk'] })
    },
  })

  const batchItems = batches.data?.data?.items ?? []
  const batchTotal = batches.data?.data?.total ?? batchItems.length
  const currentLogsTypeOption =
    ENTERPRISE_CDK_QUOTA_LOG_TYPE_OPTIONS.find(
      (option) => option.value === logsType
    ) ?? ENTERPRISE_CDK_QUOTA_LOG_TYPE_OPTIONS[0]
  const createdTotal = balance.data?.data?.created_quota ?? 0
  const usedTotal = balance.data?.data?.used_quota ?? 0
  const unusedTotal = balance.data?.data?.unused_quota ?? 0
  const unusedCodeTotal = batchItems.reduce(
    (sum, batch) =>
      sum + (batch.unused_count ?? batch.stats?.unused_count ?? 0),
    0
  )
  const redeemedRate =
    createdTotal > 0 ? ((usedTotal / createdTotal) * 100).toFixed(1) : '0.0'

  const formQuota = Number(form.quota)
  const formCount = Number(form.count)
  const hasQuotaUnit = Boolean(quotaPerUnit && quotaPerUnit > 0)
  const hasValidName = form.name.trim().length > 0
  const hasValidQuota = Number.isFinite(formQuota) && formQuota > 0
  const hasValidCount = Number.isInteger(formCount) && formCount > 0
  const totalQuota = estimateEnterpriseCdkQuota(
    form.quota,
    formCount,
    quotaPerUnit
  )
  const remainingQuota = (balance.data?.data?.balance_quota ?? 0) - totalQuota
  const insufficient = remainingQuota < 0
  const maxBatchCreateCount =
    permission.data?.data?.max_batch_create_count ?? 500
  const exceedsCreateLimit = formCount > maxBatchCreateCount
  const expiryDate = form.expired_time
    ? new Date(form.expired_time * 1000)
    : undefined
  const hasExpiredTimeInPast = Boolean(
    form.expired_time && form.expired_time <= nowSeconds
  )
  const createDisabled =
    createMutation.isPending ||
    !hasValidName ||
    !hasQuotaUnit ||
    !hasValidQuota ||
    !hasValidCount ||
    insufficient ||
    exceedsCreateLimit ||
    hasExpiredTimeInPast

  const setExpiryDate = (date: Date | undefined) => {
    setForm((current) => ({
      ...current,
      expired_time: date ? Math.floor(date.getTime() / 1000) : 0,
    }))
  }

  const setExpiryPreset = (preset: EnterpriseCdkExpiryPreset) => {
    setExpiryDate(getEnterpriseCdkExpiryPresetDate(preset))
  }

  const openCreate = (template?: EnterpriseCdkBatch) => {
    setNowSeconds(Math.floor(Date.now() / 1000))
    if (template) {
      setForm({
        name: `${template.name} 副本`,
        remark: template.remark,
        quota: formatCompactQuota(template.quota, quotaPerUnit).replace(
          '$',
          ''
        ),
        count: String(template.count),
        expired_time: template.expired_time,
      })
    } else {
      setForm(emptyForm)
    }
    setCreateOpen(true)
  }

  const searchBatches = () => {
    setBatchesPage(1)
    setAppliedBatchKeyword(batchKeyword.trim())
  }

  if (permission.isLoading) {
    return <SectionPageLayout>加载企业 CDK 权限...</SectionPageLayout>
  }

  if (!permission.data?.data?.has_permission) {
    return (
      <SectionPageLayout>
        <Card className='mx-auto mt-12 max-w-lg'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShieldAlert className='size-5' />
              暂无企业 CDK 权限
            </CardTitle>
            <CardDescription>
              当前账号未开通企业 CDK 自助创建功能，请联系管理员加入白名单并充值
              CDK 余额。
            </CardDescription>
          </CardHeader>
        </Card>
      </SectionPageLayout>
    )
  }

  return (
    <>
      <Main>
        <div
          className='flex-1 overflow-auto bg-[#fafafa] dark:bg-background p-6 text-[#0f172a] dark:text-foreground'
          style={{
            fontFamily:
              '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div className='mb-5 flex items-center justify-between gap-4'>
            <div>
              <div className='mb-1 text-[20px] leading-tight font-bold text-[#0f172a] dark:text-foreground'>
                企业 CDK
              </div>
              <div className='text-[13.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                管理你的 CDK 额度、创建批次、导出兑换码
              </div>
            </div>
            <button
              type='button'
              className='inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary px-[14px] text-[13.5px] font-medium whitespace-nowrap text-white dark:text-primary-foreground transition-colors hover:bg-[#1e293b] dark:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-[.45]'
              onClick={() => openCreate()}
            >
              <FilePlus2 className='size-[14px]' />
              创建新批次
            </button>
          </div>

          <div className='mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <OverviewStatCard
              icon={<CreditCard className='size-[14px]' />}
              title='当前 CDK 余额'
              value={formatQuota(
                balance.data?.data?.balance_quota,
                quotaPerUnit
              )}
              description='可创建 CDK 的额度上限'
            />
            <OverviewStatCard
              icon={<ClipboardList className='size-[14px]' />}
              title='已创建总面额'
              value={formatQuota(createdTotal, quotaPerUnit)}
              description='历史累计'
            />
            <OverviewStatCard
              icon={<Clock3 className='size-[14px]' />}
              title='未兑换面额'
              value={formatQuota(unusedTotal, quotaPerUnit)}
              valueClassName='text-[#d97706] dark:text-amber-400'
              description={`${unusedCodeTotal} 个码待兑换`}
            />
            <OverviewStatCard
              icon={<Check className='size-[14px]' />}
              title='已兑换面额'
              value={formatQuota(usedTotal, quotaPerUnit)}
              valueClassName='text-[#16a34a] dark:text-emerald-400'
              description={`兑换率 ${redeemedRate}%`}
            />
          </div>

          <div className='mb-5 flex gap-0 border-b border-[#e2e8f0] dark:border-border'>
            <button
              type='button'
              className={`mb-[-1px] cursor-pointer border-b-2 px-4 py-[10px] text-[13.5px] leading-5 font-medium transition-colors ${
                activeTab === 'batches'
                  ? 'border-[#0f172a] dark:border-primary text-[#0f172a] dark:text-foreground'
                  : 'border-transparent text-[#64748b] dark:text-muted-foreground hover:text-[#0f172a] dark:hover:text-foreground'
              }`}
              onClick={() => setActiveTab('batches')}
            >
              我的批次
            </button>
            <button
              type='button'
              className={`mb-[-1px] cursor-pointer border-b-2 px-4 py-[10px] text-[13.5px] leading-5 font-medium transition-colors ${
                activeTab === 'logs'
                  ? 'border-[#0f172a] dark:border-primary text-[#0f172a] dark:text-foreground'
                  : 'border-transparent text-[#64748b] dark:text-muted-foreground hover:text-[#0f172a] dark:hover:text-foreground'
              }`}
              onClick={() => setActiveTab('logs')}
            >
              余额流水
            </button>
          </div>

          {activeTab === 'batches' && (
            <div>
              <form
                className='mb-[14px] flex flex-wrap items-center gap-2'
                onSubmit={(event) => {
                  event.preventDefault()
                  searchBatches()
                }}
              >
                <input
                  type='text'
                  aria-label='搜索批次名称'
                  className='h-[34px] w-[220px] max-w-[220px] rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                  placeholder='搜索批次名称...'
                  value={batchKeyword}
                  onChange={(event) => setBatchKeyword(event.target.value)}
                />
                <button
                  type='submit'
                  className='inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[14px] text-[13.5px] leading-5 font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted'
                >
                  搜索
                </button>
                <span className='ml-auto text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                  共 {batchTotal} 个批次
                </span>
              </form>
              <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                <table className='w-full min-w-[1040px] border-collapse'>
                  <thead>
                    <tr>
                      <OverviewTableHead>批次名称</OverviewTableHead>
                      <OverviewTableHead>单个面额</OverviewTableHead>
                      <OverviewTableHead>数量</OverviewTableHead>
                      <OverviewTableHead>总面额</OverviewTableHead>
                      <OverviewTableHead>未兑换</OverviewTableHead>
                      <OverviewTableHead>已兑换</OverviewTableHead>
                      <OverviewTableHead>已过期</OverviewTableHead>
                      <OverviewTableHead>创建时间</OverviewTableHead>
                      <OverviewTableHead>过期时间</OverviewTableHead>
                      <OverviewTableHead>操作</OverviewTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {batchItems.map((batch) => {
                      const unusedCount =
                        batch.unused_count ?? batch.stats?.unused_count ?? 0
                      const usedCount =
                        batch.used_count ?? batch.stats?.used_count ?? 0
                      const expiredCount =
                        batch.expired_count ?? batch.stats?.expired_count ?? 0
                      return (
                        <tr
                          key={batch.id}
                          className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                        >
                          <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5'>
                            <Link
                              to='/enterprise-cdk/batches/$id'
                              params={{ id: String(batch.id) }}
                              className='block font-semibold text-[#0f172a] dark:text-foreground no-underline hover:underline'
                            >
                              {batch.name}
                            </Link>
                            <div className='min-h-4 text-[12px] leading-4 text-[#94a3b8] dark:text-muted-foreground/80'>
                              {batch.remark || ''}
                            </div>
                          </td>
                          <OverviewTableCell>
                            {formatCompactQuota(batch.quota, quotaPerUnit)}
                          </OverviewTableCell>
                          <OverviewTableCell>{batch.count}</OverviewTableCell>
                          <OverviewTableCell>
                            <strong>
                              {formatCompactQuota(
                                batch.total_quota,
                                quotaPerUnit
                              )}
                            </strong>
                          </OverviewTableCell>
                          <OverviewTableCell>
                            <span className='font-semibold text-[#d97706] dark:text-amber-400'>
                              {unusedCount}
                            </span>
                          </OverviewTableCell>
                          <OverviewTableCell>
                            <span className='font-semibold text-[#16a34a] dark:text-emerald-400'>
                              {usedCount}
                            </span>
                          </OverviewTableCell>
                          <OverviewTableCell>
                            <span
                              className={
                                expiredCount > 0
                                  ? 'text-[#94a3b8] dark:text-muted-foreground/80'
                                  : 'text-[#0f172a] dark:text-foreground'
                              }
                            >
                              {expiredCount}
                            </span>
                          </OverviewTableCell>
                          <OverviewTableCell>
                            {formatDateOnly(batch.created_time)}
                          </OverviewTableCell>
                          <OverviewTableCell>
                            {formatDateOnly(batch.expired_time, '永不过期')}
                          </OverviewTableCell>
                          <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap text-[#0f172a] dark:text-foreground'>
                            <div className='flex items-center gap-2'>
                              <Link
                                to='/enterprise-cdk/batches/$id'
                                params={{ id: String(batch.id) }}
                                className='inline-flex h-6 cursor-pointer items-center justify-center rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-2 text-[12px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground no-underline transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted'
                              >
                                详情
                              </Link>
                              <button
                                type='button'
                                className='inline-flex h-6 cursor-pointer items-center justify-center rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-2 text-[12px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted'
                                onClick={() =>
                                  exportEnterpriseCdkCodes({
                                    batch_id: batch.id,
                                  })
                                }
                              >
                                导出
                              </button>
                              <button
                                type='button'
                                className='inline-flex h-6 cursor-pointer items-center justify-center rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-2 text-[12px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted'
                                onClick={() => openCreate(batch)}
                              >
                                再次创建
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {batchItems.length === 0 && (
                      <tr>
                        <td
                          colSpan={10}
                          className='h-32 px-[14px] py-[11px] text-center text-[13.5px] text-[#64748b] dark:text-muted-foreground'
                        >
                          暂无批次
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <OverviewPagination
                page={batches.data?.data?.page ?? batchesPage}
                pageSize={batches.data?.data?.page_size}
                total={batches.data?.data?.total}
                onPageChange={setBatchesPage}
              />
            </div>
          )}

          {activeTab === 'logs' && (
            <div>
              <div className='mb-[14px] flex flex-wrap items-center gap-2'>
                <Select
                  value={logsType}
                  onValueChange={(value) => {
                    setLogsType(value ?? 'all')
                    setLogsPage(1)
                  }}
                >
                  <SelectTrigger
                    aria-label='筛选流水类型'
                    className='!h-[34px] min-w-[176px] rounded-[8px] border-[#cbd5e1] dark:border-input !bg-white dark:!bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:!bg-[#f8fafc] dark:hover:!bg-muted/50 focus-visible:border-[#94a3b8] dark:focus-visible:border-ring focus-visible:ring-[#94a3b8]/20 dark:focus-visible:ring-ring/40 [&_svg]:text-[#64748b] dark:[&_svg]:text-muted-foreground'
                  >
                    <span
                      data-slot='select-value'
                      className='flex flex-1 items-center text-left'
                    >
                      {currentLogsTypeOption.label}
                    </span>
                  </SelectTrigger>
                  <SelectContent
                    align='start'
                    alignItemWithTrigger={false}
                    sideOffset={6}
                    className='min-w-[176px] rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card p-1 text-[#0f172a] dark:text-foreground shadow-[0_12px_28px_rgba(15,23,42,0.14)] ring-0'
                  >
                    <SelectGroup>
                      {ENTERPRISE_CDK_QUOTA_LOG_TYPE_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className='rounded-[8px] px-2 py-[7px] text-[13.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground focus:bg-[#f1f5f9] dark:focus:bg-muted focus:text-[#0f172a] dark:focus:text-foreground data-[selected]:bg-[#eff6ff] dark:data-[selected]:bg-primary/10 data-[selected]:text-[#2563eb] dark:data-[selected]:text-primary'
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <span className='ml-auto text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                  共 {logs.data?.data?.total ?? 0} 条流水
                </span>
              </div>
              <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                <table className='w-full min-w-[760px] border-collapse'>
                  <thead>
                    <tr>
                      <OverviewTableHead>时间</OverviewTableHead>
                      <OverviewTableHead>操作类型</OverviewTableHead>
                      <OverviewTableHead>变动金额</OverviewTableHead>
                      <OverviewTableHead>变动后余额</OverviewTableHead>
                      <OverviewTableHead>关联批次</OverviewTableHead>
                      <OverviewTableHead>备注</OverviewTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {(logs.data?.data?.items ?? []).map((log) => (
                      <tr
                        key={log.id}
                        className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                      >
                        <OverviewTableCell>
                          {formatMinuteTime(log.created_time)}
                        </OverviewTableCell>
                        <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap'>
                          <span className={getQuotaLogBadgeClass(log.type)}>
                            {formatEnterpriseCdkQuotaLogType(log.type)}
                          </span>
                        </td>
                        <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap'>
                          <span
                            className={
                              log.amount >= 0
                                ? 'font-semibold text-[#16a34a] dark:text-emerald-400'
                                : 'font-semibold text-[#dc2626] dark:text-red-400'
                            }
                          >
                            {formatSignedQuota(log.amount, quotaPerUnit)}
                          </span>
                        </td>
                        <OverviewTableCell>
                          <strong>
                            {formatQuota(log.balance_after, quotaPerUnit)}
                          </strong>
                        </OverviewTableCell>
                        <OverviewTableCell>
                          {log.batch_name || log.related_batch_id || '-'}
                        </OverviewTableCell>
                        <td className='max-w-[260px] truncate border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                          {log.remark || '-'}
                        </td>
                      </tr>
                    ))}
                    {(logs.data?.data?.items ?? []).length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className='h-32 px-[14px] py-[11px] text-center text-[13.5px] text-[#64748b] dark:text-muted-foreground'
                        >
                          暂无流水
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <OverviewPagination
                page={logs.data?.data?.page ?? logsPage}
                pageSize={logs.data?.data?.page_size}
                total={logs.data?.data?.total}
                onPageChange={setLogsPage}
              />
            </div>
          )}
        </div>
      </Main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          showCloseButton={false}
          overlayClassName='bg-black/45 supports-backdrop-filter:backdrop-blur-[2px]'
          className='max-h-[90vh] gap-0 overflow-hidden rounded-[12px] bg-white dark:bg-card p-0 text-[#0f172a] dark:text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.12)] ring-0 sm:max-w-[560px]'
          style={{
            fontFamily:
              '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div className='flex items-start justify-between border-b border-[#e2e8f0] dark:border-border px-6 pt-5 pb-4'>
            <div>
              <DialogTitle className='text-[15px] leading-5 font-bold text-[#0f172a] dark:text-foreground'>
                创建 CDK 批次
              </DialogTitle>
              <DialogDescription className='mt-0.5 text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                填写参数后一键生成，余额将实时扣减
              </DialogDescription>
            </div>
            <button
              type='button'
              aria-label='关闭创建弹窗'
              className='inline-flex size-7 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent text-[#64748b] dark:text-muted-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted hover:text-[#0f172a] dark:hover:text-foreground'
              onClick={() => setCreateOpen(false)}
            >
              <X className='size-[17px]' />
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (createDisabled) return
              createMutation.mutate({
                ...form,
                name: form.name.trim(),
                count: formCount,
              })
            }}
          >
            <div className='max-h-[calc(90vh-126px)] overflow-y-auto px-6 py-5'>
              <div className='mb-4 flex items-start gap-[10px] rounded-[8px] border border-[#bfdbfe] dark:border-primary/30 bg-[#eff6ff] dark:bg-primary/10 px-[14px] py-3 text-[13px] leading-5 text-[#2563eb] dark:text-blue-400'>
                <Info className='mt-px size-[15px] shrink-0' />
                <span>
                  当前 CDK 余额：
                  <strong>
                    {formatQuota(
                      balance.data?.data?.balance_quota,
                      quotaPerUnit
                    )}
                  </strong>
                  &nbsp;·&nbsp;本次可用上限由余额决定
                </span>
              </div>

              <div className='grid gap-[14px]'>
                <div className='grid gap-[14px] sm:grid-cols-2'>
                  <div className='flex flex-col gap-[5px]'>
                    <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                      批次名称 <span className='text-[#dc2626] dark:text-red-400'>*</span>
                    </label>
                    <input
                      type='text'
                      className='h-[34px] w-full rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                      placeholder='例：2026年Q3 全员激活码'
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='flex flex-col gap-[5px]'>
                    <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                      批次备注
                    </label>
                    <input
                      type='text'
                      className='h-[34px] w-full rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                      placeholder='可选，例：发给市场部'
                      value={form.remark}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          remark: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className='grid gap-[14px] sm:grid-cols-2'>
                  <div className='flex flex-col gap-[5px]'>
                    <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                      单个面额 (USD) <span className='text-[#dc2626] dark:text-red-400'>*</span>
                    </label>
                    <div className='relative'>
                      <span className='pointer-events-none absolute top-1/2 left-[10px] -translate-y-1/2 text-[13px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                        $
                      </span>
                      <input
                        type='number'
                        min='0'
                        step='0.01'
                        className='h-[34px] w-full rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 py-[7px] pr-[10px] pl-[26px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                        value={form.quota}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            quota: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className='flex flex-col gap-[5px]'>
                    <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                      创建数量 <span className='text-[#dc2626] dark:text-red-400'>*</span>
                    </label>
                    <input
                      type='number'
                      min='1'
                      max={maxBatchCreateCount}
                      className='h-[34px] w-full rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                      value={form.count}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          count: event.target.value,
                        }))
                      }
                    />
                    <span className='text-[12px] leading-4 text-[#94a3b8] dark:text-muted-foreground/80'>
                      最多 {maxBatchCreateCount} 个
                    </span>
                  </div>
                </div>

                <div className='flex flex-col gap-[5px]'>
                  <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                    过期时间
                  </label>
                  <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start'>
                    <DateTimePicker
                      value={expiryDate}
                      onChange={setExpiryDate}
                      placeholder='永不过期'
                      className='min-w-0 gap-2 [&>button]:h-[34px] [&>button]:rounded-[8px] [&>button]:border-[#cbd5e1] dark:[&>button]:border-input [&>button]:bg-white dark:[&>button]:bg-input/30 [&>button]:px-[10px] [&>button]:text-[13.5px] [&>button]:font-normal [&>button]:text-[#0f172a] dark:[&>button]:text-foreground [&>input[type=time]]:h-[34px] [&>input[type=time]]:w-[104px] [&>input[type=time]]:rounded-[8px] [&>input[type=time]]:border-[#cbd5e1] dark:[&>input[type=time]]:border-input [&>input[type=time]]:bg-white dark:[&>input[type=time]]:bg-input/30 [&>input[type=time]]:text-[13.5px] dark:[&>input[type=time]]:text-foreground disabled:[&>input[type=time]]:bg-[#f8fafc] dark:disabled:[&>input[type=time]]:bg-muted/50 disabled:[&>input[type=time]]:text-[#94a3b8] dark:disabled:[&>input[type=time]]:text-muted-foreground/70'
                    />
                    <div className='grid grid-cols-4 gap-2 sm:flex'>
                      {(
                        [
                          ['永不', 'never'],
                          ['1个月', '1_month'],
                          ['1周', '1_week'],
                          ['1天', '1_day'],
                        ] as const
                      ).map(([label, preset]) => (
                        <button
                          key={preset}
                          type='button'
                          className='inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[10px] text-[13px] leading-5 font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted'
                          onClick={() => setExpiryPreset(preset)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className='text-[12px] leading-4 text-[#94a3b8] dark:text-muted-foreground/80'>
                    留空表示永不过期
                  </span>
                </div>

                <div className='mt-0.5 rounded-[8px] border border-[#e2e8f0] dark:border-border bg-[#f1f5f9] dark:bg-muted px-[14px] py-3 text-[13px] leading-5'>
                  <div className='mb-2 text-[11.5px] leading-4 font-bold tracking-[.06em] text-[#94a3b8] dark:text-muted-foreground/80 uppercase'>
                    本次费用预览
                  </div>
                  <div className='flex items-center justify-between py-[3px]'>
                    <span className='text-[#64748b] dark:text-muted-foreground'>单个面额</span>
                    <span className='font-semibold text-[#0f172a] dark:text-foreground'>
                      {formatCompactQuota(
                        totalQuota > 0 ? totalQuota / formCount : 0,
                        quotaPerUnit
                      )}
                    </span>
                  </div>
                  <div className='flex items-center justify-between py-[3px]'>
                    <span className='text-[#64748b] dark:text-muted-foreground'>创建数量</span>
                    <span className='font-semibold text-[#0f172a] dark:text-foreground'>
                      × {Number.isFinite(formCount) ? formCount : 0} 个
                    </span>
                  </div>
                  <div className='my-2 h-px bg-[#e2e8f0] dark:bg-border' />
                  <div className='flex items-center justify-between py-[3px]'>
                    <span className='font-semibold text-[#64748b] dark:text-muted-foreground'>
                      本次扣减余额
                    </span>
                    <span className='text-[15px] leading-5 font-semibold text-[#0f172a] dark:text-foreground'>
                      {formatQuota(totalQuota, quotaPerUnit)}
                    </span>
                  </div>
                  <div className='flex items-center justify-between py-[3px]'>
                    <span className='text-[#64748b] dark:text-muted-foreground'>创建后剩余余额</span>
                    <span
                      className={`font-semibold ${
                        insufficient ? 'text-[#dc2626] dark:text-red-400' : 'text-[#16a34a] dark:text-emerald-400'
                      }`}
                    >
                      {formatQuota(remainingQuota, quotaPerUnit)}
                    </span>
                  </div>
                  {insufficient && (
                    <p className='mt-2 text-[12px] leading-4 text-[#dc2626] dark:text-red-400'>
                      {enterpriseCdkContactMessage}
                    </p>
                  )}
                  {exceedsCreateLimit && (
                    <p className='mt-2 text-[12px] leading-4 text-[#dc2626] dark:text-red-400'>
                      当前账号单次最多创建 {maxBatchCreateCount} 个 CDK。
                    </p>
                  )}
                  {hasExpiredTimeInPast && (
                    <p className='mt-2 text-[12px] leading-4 text-[#dc2626] dark:text-red-400'>
                      过期时间不能早于当前时间。
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className='flex items-center justify-end gap-2 border-t border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-6 py-[14px]'>
              <button
                type='button'
                className='inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[14px] text-[13.5px] leading-5 font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted'
                onClick={() => setCreateOpen(false)}
              >
                取消
              </button>
              <button
                type='submit'
                disabled={createDisabled}
                className='inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary px-[14px] text-[13.5px] leading-5 font-medium whitespace-nowrap text-white dark:text-primary-foreground transition-colors hover:bg-[#1e293b] dark:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-[.45]'
              >
                <Plus className='size-[14px]' />
                确认创建
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function EnterpriseCdkBatchDetailPage({ batchId }: { batchId: number }) {
  const { status } = useStatus()
  const quotaPerUnit = status?.quota_per_unit
  const [statusFilter, setStatusFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const detail = useQuery({
    queryKey: [
      'enterprise-cdk',
      'batch-detail',
      batchId,
      statusFilter,
      keyword,
      page,
    ],
    queryFn: () =>
      getEnterpriseCdkBatchDetail(batchId, {
        p: page,
        status: statusFilter === 'all' ? '' : statusFilter,
        keyword,
      }),
  })

  const pageInfo = detail.data?.data?.cdks
  const codes = pageInfo?.items ?? []
  const batch = detail.data?.data?.batch
  const usedCount = batch?.used_count ?? batch?.stats?.used_count ?? 0
  const unusedCount = batch?.unused_count ?? batch?.stats?.unused_count ?? 0
  const expiredCount = batch?.expired_count ?? batch?.stats?.expired_count ?? 0
  const disabledCount =
    batch?.disabled_count ?? batch?.stats?.disabled_count ?? 0
  const totalCount = batch?.count ?? 0
  const usedPercent =
    totalCount > 0 ? Math.round((usedCount / totalCount) * 100) : 0

  if (detail.isLoading) {
    return <SectionPageLayout>加载批次详情...</SectionPageLayout>
  }

  if (detail.isError || (detail.data && !detail.data.success)) {
    return (
      <SectionPageLayout>
        <Card className='mx-auto mt-12 max-w-lg'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShieldAlert className='size-5' />
              暂无企业 CDK 权限
            </CardTitle>
            <CardDescription>
              当前账号无权查看该批次，请确认账号白名单或批次归属。
            </CardDescription>
          </CardHeader>
        </Card>
      </SectionPageLayout>
    )
  }

  const toggleSelected = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  const copyUnused = async () => {
    if (!batch) return
    const res = await copyEnterpriseCdkUnusedCodes(batch.id)
    if (!res.success || !res.data) {
      toast.error(res.message || '复制失败')
      return
    }
    const text = res.data.codes.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`已复制 ${res.data.count} 个未兑换 CDK`)
    } catch {
      toast.error('复制失败，请手动选择')
    }
  }

  const copySelected = async () => {
    const selectedCodes = codes.filter((code) => selectedIds.includes(code.id))
    if (selectedCodes.length === 0) return
    try {
      await navigator.clipboard.writeText(
        selectedCodes.map((code) => code.key).join('\n')
      )
      toast.success(`已复制 ${selectedCodes.length} 个选中 CDK`)
    } catch {
      toast.error('复制失败，请手动选择')
    }
  }

  const pageSize = pageInfo?.page_size || codes.length || 20
  const totalItems = pageInfo?.total ?? codes.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = pageInfo?.page ?? page
  const allCurrentPageSelected =
    codes.length > 0 && codes.every((code) => selectedIds.includes(code.id))
  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  )
    .filter(
      (pageNumber) =>
        totalPages <= 5 ||
        pageNumber === 1 ||
        pageNumber === totalPages ||
        Math.abs(pageNumber - currentPage) <= 1
    )
    .slice(0, 5)

  return (
    <Main>
      <div
        className='flex-1 overflow-auto bg-[#fafafa] dark:bg-background p-6 text-[#0f172a] dark:text-foreground'
        style={{
          fontFamily:
            '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div className='mb-5 flex items-center justify-between gap-4'>
          <div className='min-w-0'>
            <div className='mb-3 flex items-center gap-3'>
              <Link
                to='/enterprise-cdk'
                className='inline-flex h-[28px] items-center justify-center gap-1.5 rounded-[8px] px-2 text-[12.5px] font-medium whitespace-nowrap text-[#64748b] dark:text-muted-foreground no-underline transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted hover:text-[#0f172a] dark:hover:text-foreground'
              >
                <ChevronLeft className='size-[14px]' />
                返回
              </Link>
            </div>
            <div className='mb-1 truncate text-[20px] leading-tight font-bold text-[#0f172a] dark:text-foreground'>
              {batch?.name ?? '批次详情'}
            </div>
            <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
              <span>批次备注：{batch?.remark || '无'}</span>
              <span>·</span>
              <span>面额 {formatCompactQuota(batch?.quota, quotaPerUnit)}</span>
              <span>·</span>
              <span>共 {totalCount} 个</span>
              <span>·</span>
              <span>过期 {formatDateOnly(batch?.expired_time)}</span>
            </div>
          </div>

          <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
            <button
              type='button'
              className='inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[14px] text-[13.5px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-[.45]'
              disabled={!batch}
              onClick={copyUnused}
            >
              <Copy className='size-[14px]' />
              一键复制未兑换
            </button>
            <button
              type='button'
              className='inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[14px] text-[13.5px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-[.45]'
              disabled={selectedIds.length === 0}
              onClick={copySelected}
            >
              <Copy className='size-[14px]' />
              复制选中
            </button>
            <button
              type='button'
              className='inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary px-[14px] text-[13.5px] font-medium whitespace-nowrap text-white dark:text-primary-foreground transition-colors hover:bg-[#1e293b] dark:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-[.45]'
              disabled={selectedIds.length === 0}
              onClick={() => exportEnterpriseCdkCodes({ cdk_ids: selectedIds })}
            >
              <Download className='size-[14px]' />
              导出选中
            </button>
            <button
              type='button'
              className='inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[14px] text-[13.5px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-[.45]'
              disabled={!batch}
              onClick={() =>
                batch && exportEnterpriseCdkCodes({ batch_id: batch.id })
              }
            >
              <Download className='size-[14px]' />
              导出全部
            </button>
          </div>
        </div>

        <div className='mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5'>
          <DetailStatCard title='总数量' value={String(totalCount)} />
          <DetailStatCard
            title='未兑换'
            value={String(unusedCount)}
            valueClassName='text-[#d97706] dark:text-amber-400'
          />
          <DetailStatCard
            title='已兑换'
            value={String(usedCount)}
            valueClassName='text-[#16a34a] dark:text-emerald-400'
          />
          <DetailStatCard
            title='已过期'
            value={String(expiredCount)}
            valueClassName='text-[#94a3b8] dark:text-muted-foreground/80'
          />
          <DetailStatCard
            title='已禁用'
            value={String(disabledCount)}
            valueClassName='text-[#dc2626] dark:text-red-400'
          />
        </div>

        <div className='mb-[14px]'>
          <div className='h-1 w-full overflow-hidden rounded-full bg-[#e2e8f0] dark:bg-border'>
            <div
              className='h-full rounded-full bg-[#16a34a] dark:bg-emerald-500'
              style={{ width: `${Math.min(100, Math.max(0, usedPercent))}%` }}
            />
          </div>
          <div className='mt-1 text-[12px] leading-4 text-[#64748b] dark:text-muted-foreground'>
            兑换进度 {usedPercent}%（{usedCount} / {totalCount}）
          </div>
        </div>

        <div className='mb-[14px] flex flex-wrap items-center gap-2'>
          <div className='mb-0 flex gap-0 border-b-0'>
            {[
              ['all', totalCount],
              ['unused', unusedCount],
              ['used', usedCount],
              ['expired', expiredCount],
              ['disabled', disabledCount],
            ].map(([item, count]) => (
              <button
                key={item}
                type='button'
                className={`mb-[-1px] cursor-pointer border-b-2 px-4 py-[10px] text-[13.5px] leading-5 font-medium transition-colors ${
                  statusFilter === item
                    ? 'border-[#0f172a] dark:border-primary text-[#0f172a] dark:text-foreground'
                    : 'border-transparent text-[#64748b] dark:text-muted-foreground hover:text-[#0f172a] dark:hover:text-foreground'
                }`}
                onClick={() => {
                  setStatusFilter(String(item))
                  setPage(1)
                  setSelectedIds([])
                }}
              >
                {statusLabel(String(item))} ({count})
              </button>
            ))}
          </div>
          <div className='ml-auto flex items-center gap-2'>
            <input
              type='text'
              className='h-8 w-[200px] max-w-[200px] rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13px] text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
              placeholder='搜索 CDK 码…'
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setPage(1)
                setSelectedIds([])
              }}
            />
          </div>
        </div>

        <div className='mt-[10px] overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
          <table className='w-full min-w-[1040px] border-collapse'>
            <thead>
              <tr>
                <th className='w-10 border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                  <input
                    type='checkbox'
                    className='size-[15px] cursor-pointer align-middle accent-[#0f172a] dark:accent-primary'
                    checked={allCurrentPageSelected}
                    onChange={(event) => {
                      setSelectedIds(
                        event.target.checked ? codes.map((code) => code.id) : []
                      )
                    }}
                  />
                </th>
                <th className='border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                  CDK 码
                </th>
                <th className='border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                  面额
                </th>
                <th className='border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                  状态
                </th>
                <th className='border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                  创建时间
                </th>
                <th className='border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                  过期时间
                </th>
                <th className='border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                  兑换时间
                </th>
                <th className='border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                  兑换用户
                </th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const codeStatus = getCodeStatus(code)
                return (
                  <tr
                    key={code.id}
                    className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                  >
                    <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px]'>
                      <input
                        type='checkbox'
                        className='size-[15px] cursor-pointer align-middle accent-[#0f172a] dark:accent-primary'
                        checked={selectedIds.includes(code.id)}
                        onChange={() => toggleSelected(code.id)}
                      />
                    </td>
                    <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle font-mono text-[12.5px] leading-5 whitespace-nowrap text-[#0f172a] dark:text-foreground'>
                      {code.key}
                    </td>
                    <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap text-[#0f172a] dark:text-foreground'>
                      {formatCompactQuota(code.quota, quotaPerUnit)}
                    </td>
                    <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap'>
                      <span className={getDetailStatusPillClass(codeStatus)}>
                        {codeStatus}
                      </span>
                    </td>
                    <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                      {formatDateOnly(code.created_time)}
                    </td>
                    <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                      {formatDateOnly(code.expired_time)}
                    </td>
                    <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
                      {formatMinuteTime(code.redeemed_time)}
                    </td>
                    <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap text-[#0f172a] dark:text-foreground'>
                      {code.used_user_email || code.used_user_id || '-'}
                    </td>
                  </tr>
                )
              })}
              {codes.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className='h-32 px-[14px] py-[11px] text-center text-[13.5px] text-[#64748b] dark:text-muted-foreground'
                  >
                    暂无 CDK
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className='mt-3 flex items-center justify-between text-[13px] leading-5 text-[#64748b] dark:text-muted-foreground'>
          <span>
            共 {totalItems} 条，每页 {pageSize} 条
          </span>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              className='inline-flex h-[28px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[10px] text-[12.5px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-[.45]'
              disabled={currentPage <= 1}
              onClick={() => {
                setSelectedIds([])
                setPage((value) => Math.max(1, value - 1))
              }}
            >
              ‹ 上一页
            </button>
            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type='button'
                className={`inline-flex h-[28px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border px-[10px] text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                  pageNumber === currentPage
                    ? 'border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary text-white dark:text-primary-foreground'
                    : 'border-[#cbd5e1] dark:border-input bg-transparent text-[#0f172a] dark:text-foreground hover:bg-[#f1f5f9] dark:hover:bg-muted'
                }`}
                onClick={() => {
                  setSelectedIds([])
                  setPage(pageNumber)
                }}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type='button'
              className='inline-flex h-[28px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[10px] text-[12.5px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-[.45]'
              disabled={currentPage >= totalPages}
              onClick={() => {
                setSelectedIds([])
                setPage((value) => Math.min(totalPages, value + 1))
              }}
            >
              下一页 ›
            </button>
          </div>
        </div>
      </div>
    </Main>
  )
}

function DetailStatCard({
  title,
  value,
  valueClassName = 'text-[#0f172a] dark:text-foreground',
}: {
  title: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className='rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]'>
      <div className='mb-1.5 flex items-center gap-1.5 text-[12px] leading-4 font-medium text-[#64748b] dark:text-muted-foreground'>
        {title}
      </div>
      <div
        className={`text-[20px] leading-[1.1] font-bold tracking-normal ${valueClassName}`}
      >
        {value}
      </div>
    </div>
  )
}

function OverviewStatCard({
  icon,
  title,
  value,
  description,
  valueClassName = 'text-[#0f172a] dark:text-foreground',
}: {
  icon: ReactNode
  title: string
  value: string
  description: string
  valueClassName?: string
}) {
  const valueMatch = /^(.*?)(\.\d+)$/.exec(value)
  return (
    <div className='rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card px-[18px] py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]'>
      <div className='mb-1.5 flex items-center gap-1.5 text-[12px] leading-4 font-medium text-[#64748b] dark:text-muted-foreground'>
        {icon}
        {title}
      </div>
      <div
        className={`text-[24px] leading-[1.1] font-bold tracking-normal ${valueClassName}`}
      >
        {valueMatch ? (
          <>
            {valueMatch[1]}
            <span className='text-[16px]'>{valueMatch[2]}</span>
          </>
        ) : (
          value
        )}
      </div>
      <div className='mt-1 text-[11.5px] leading-4 text-[#94a3b8] dark:text-muted-foreground/80'>
        {description}
      </div>
    </div>
  )
}

function OverviewTableHead({ children }: { children: ReactNode }) {
  return (
    <th className='border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
      {children}
    </th>
  )
}

function OverviewTableCell({ children }: { children: ReactNode }) {
  return (
    <td className='border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap text-[#0f172a] dark:text-foreground'>
      {children}
    </td>
  )
}

function OverviewPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize?: number
  total?: number
  onPageChange: (page: number) => void
}) {
  const totalItems = total ?? 0
  const size = pageSize || 100
  const totalPages = Math.max(1, Math.ceil(totalItems / size))
  return (
    <div className='mt-3 flex items-center justify-end gap-3 text-[13px] leading-5 text-[#64748b] dark:text-muted-foreground'>
      <span>
        第 {page} 页，共 {totalPages} 页
      </span>
      <button
        type='button'
        className='inline-flex h-[28px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[10px] text-[12.5px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-[.45]'
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        ‹ 上一页
      </button>
      <button
        type='button'
        className='inline-flex h-[28px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[10px] text-[12.5px] font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-[.45]'
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        下一页 ›
      </button>
    </div>
  )
}

function statusLabel(value: string) {
  switch (value) {
    case 'unused':
      return '未兑换'
    case 'used':
      return '已兑换'
    case 'expired':
      return '已过期'
    case 'disabled':
      return '已禁用'
    default:
      return '全部'
  }
}

function formatDateOnly(timestamp?: number, emptyText = '永不过期') {
  if (!timestamp) return emptyText
  const date = new Date(timestamp * 1000)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCompactQuota(quota: number | undefined, quotaPerUnit?: number) {
  return formatQuota(quota, quotaPerUnit).replace(/\.00$/, '')
}

function formatMinuteTime(timestamp?: number, emptyText = '-') {
  if (!timestamp) return emptyText
  const date = new Date(timestamp * 1000)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function getDetailStatusPillClass(status: string) {
  const base =
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] leading-4 font-medium'
  switch (status) {
    case '已兑换':
      return `${base} border-[#bbf7d0] dark:border-emerald-500/30 bg-[#f0fdf4] dark:bg-emerald-500/10 text-[#16a34a] dark:text-emerald-400`
    case '未兑换':
      return `${base} border-[#fde68a] dark:border-amber-500/30 bg-[#fffbeb] dark:bg-amber-500/10 text-[#d97706] dark:text-amber-400`
    case '已禁用':
      return `${base} border-[#fecaca] dark:border-red-500/30 bg-[#fef2f2] dark:bg-red-500/10 text-[#dc2626] dark:text-red-400`
    case '已过期':
    case '已回收':
      return `${base} border-[#e2e8f0] dark:border-border bg-[#f1f5f9] dark:bg-muted text-[#64748b] dark:text-muted-foreground`
    default:
      return `${base} border-[#e2e8f0] dark:border-border bg-[#f1f5f9] dark:bg-muted text-[#64748b] dark:text-muted-foreground`
  }
}

function getQuotaLogBadgeClass(type: string) {
  const base =
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] leading-4 font-medium'
  switch (type) {
    case 'admin_add':
    case 'admin_refund':
      return `${base} border-[#bbf7d0] dark:border-emerald-500/30 bg-[#f0fdf4] dark:bg-emerald-500/10 text-[#16a34a] dark:text-emerald-400`
    case 'admin_deduct':
    case 'create_cdk':
      return `${base} border-[#fecaca] dark:border-red-500/30 bg-[#fef2f2] dark:bg-red-500/10 text-[#dc2626] dark:text-red-400`
    default:
      return `${base} border-[#e2e8f0] dark:border-border bg-[#f1f5f9] dark:bg-muted text-[#64748b] dark:text-muted-foreground`
  }
}

function estimateEnterpriseCdkQuota(
  amount: string,
  count: number,
  quotaPerUnit?: number
) {
  if (
    !quotaPerUnit ||
    quotaPerUnit <= 0 ||
    !Number.isInteger(count) ||
    count <= 0
  ) {
    return 0
  }
  const normalized = amount.trim()
  const match = /^(\d+)(?:\.(\d{0,8}))?$/.exec(normalized)
  if (!match) return 0
  const whole = BigInt(match[1])
  const scale = 100_000_000n
  const fraction = BigInt((match[2] ?? '').padEnd(8, '0'))
  const unit = BigInt(Math.trunc(quotaPerUnit))
  const single = ((whole * scale + fraction) * unit) / scale
  return Number(single * BigInt(count))
}

export { CDK_STATUS }
