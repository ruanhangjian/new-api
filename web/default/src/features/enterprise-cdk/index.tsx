import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Copy,
  Download,
  FilePlus2,
  History,
  ListFilter,
  RotateCcw,
  Search,
  ShieldAlert,
  Ticket,
} from 'lucide-react'
import { toast } from 'sonner'
import { useStatus } from '@/hooks/use-status'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { SectionPageLayout } from '@/components/layout'
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
import { PaginationControls } from './pagination-controls'
import type { CreateEnterpriseCdkBatchInput, EnterpriseCdkBatch } from './types'
import {
  CDK_STATUS,
  formatDateTimeLocal,
  formatQuota,
  formatTime,
  getCodeStatus,
  getCodeStatusTone,
} from './utils'

const emptyForm: CreateEnterpriseCdkBatchInput = {
  name: '',
  remark: '',
  quota: '10.00',
  count: 10,
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
  const [form, setForm] = useState<CreateEnterpriseCdkBatchInput>(emptyForm)
  const [batchesPage, setBatchesPage] = useState(1)
  const [logsPage, setLogsPage] = useState(1)

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
    queryKey: ['enterprise-cdk', 'batches', batchesPage],
    queryFn: () => getEnterpriseCdkBatches({ p: batchesPage }),
    enabled: permission.data?.data?.has_permission === true,
  })
  const logs = useQuery({
    queryKey: ['enterprise-cdk', 'balance-logs', logsPage],
    queryFn: () => getEnterpriseCdkBalanceLogs({ p: logsPage }),
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
  const createdTotal = balance.data?.data?.created_quota ?? 0
  const usedTotal = balance.data?.data?.used_quota ?? 0
  const unusedTotal = balance.data?.data?.unused_quota ?? 0

  const formQuota = Number(form.quota)
  const formCount = Number(form.count)
  const hasValidName = form.name.trim().length > 0
  const hasValidQuota = Number.isFinite(formQuota) && formQuota > 0
  const hasValidCount = Number.isInteger(formCount) && formCount > 0
  const totalQuota =
    Math.max(0, Number.isFinite(formQuota) ? formQuota : 0) *
    Math.max(0, Number.isFinite(formCount) ? formCount : 0) *
    (quotaPerUnit || 500000)
  const remainingQuota = (balance.data?.data?.balance_quota ?? 0) - totalQuota
  const insufficient = remainingQuota < 0
  const maxBatchCreateCount =
    permission.data?.data?.max_batch_create_count ?? 500
  const exceedsCreateLimit = formCount > maxBatchCreateCount
  const createDisabled =
    createMutation.isPending ||
    !hasValidName ||
    !hasValidQuota ||
    !hasValidCount ||
    insufficient ||
    exceedsCreateLimit

  const openCreate = (template?: EnterpriseCdkBatch) => {
    if (template) {
      setForm({
        name: `${template.name} 副本`,
        remark: template.remark,
        quota: formatQuota(template.quota, quotaPerUnit).replace('$', ''),
        count: template.count,
        expired_time: template.expired_time,
      })
    } else {
      setForm(emptyForm)
    }
    setCreateOpen(true)
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
      <SectionPageLayout>
        <SectionPageLayout.Title>企业 CDK</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          使用独立 CDK 余额自助创建、查看、复制和导出兑换码。
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <Button onClick={() => openCreate()}>
            <FilePlus2 />
            创建 CDK
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-4'>
            <div className='grid gap-3 md:grid-cols-4'>
              <StatCard
                title='当前 CDK 余额'
                value={balance.data?.data?.balance ?? '$0.00'}
                description='仅用于创建企业 CDK'
              />
              <StatCard
                title='已创建总面额'
                value={formatQuota(createdTotal, quotaPerUnit)}
                description={`${batchItems.length} 个批次`}
              />
              <StatCard
                title='未兑换总面额'
                value={formatQuota(unusedTotal, quotaPerUnit)}
                description='可继续分发'
              />
              <StatCard
                title='已兑换总面额'
                value={formatQuota(usedTotal, quotaPerUnit)}
                description='最终用户已领取'
              />
            </div>

            <Tabs defaultValue='batches'>
              <TabsList variant='line'>
                <TabsTrigger value='batches'>
                  <Ticket className='size-4' />
                  我的批次
                </TabsTrigger>
                <TabsTrigger value='logs'>
                  <History className='size-4' />
                  余额流水
                </TabsTrigger>
              </TabsList>
              <TabsContent value='batches'>
                <Card>
                  <CardHeader>
                    <CardTitle>我的 CDK 批次</CardTitle>
                    <CardDescription>
                      查看批次统计，导出 CSV，或复用历史参数再次创建。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className='divide-border divide-y md:hidden'>
                      {batchItems.map((batch) => (
                        <div key={batch.id} className='space-y-3 py-3'>
                          <Link
                            to='/enterprise-cdk/batches/$id'
                            params={{ id: String(batch.id) }}
                            className='block font-medium hover:underline'
                          >
                            {batch.name}
                          </Link>
                          <div className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
                            <MobileFact
                              label='面额'
                              value={formatQuota(batch.quota, quotaPerUnit)}
                            />
                            <MobileFact label='数量' value={batch.count} />
                            <MobileFact
                              label='未兑换'
                              value={
                                batch.unused_count ??
                                batch.stats?.unused_count ??
                                0
                              }
                            />
                            <MobileFact
                              label='已兑换'
                              value={
                                batch.used_count ?? batch.stats?.used_count ?? 0
                              }
                            />
                            <MobileFact
                              label='过期时间'
                              value={formatTime(batch.expired_time, '永不过期')}
                            />
                          </div>
                          <div className='flex flex-wrap justify-end gap-2'>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() =>
                                exportEnterpriseCdkCodes({ batch_id: batch.id })
                              }
                            >
                              <Download />
                              导出
                            </Button>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => openCreate(batch)}
                            >
                              <RotateCcw />
                              再次创建
                            </Button>
                          </div>
                        </div>
                      ))}
                      {batchItems.length === 0 && (
                        <div className='text-muted-foreground py-10 text-center'>
                          暂无批次
                        </div>
                      )}
                    </div>
                    <div className='hidden md:block'>
                      <Table className='min-w-[760px]'>
                        <TableHeader>
                          <TableRow>
                            <TableHead>批次名称</TableHead>
                            <TableHead>面额</TableHead>
                            <TableHead>数量</TableHead>
                            <TableHead>未兑换</TableHead>
                            <TableHead>已兑换</TableHead>
                            <TableHead>过期时间</TableHead>
                            <TableHead className='text-right'>操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {batchItems.map((batch) => (
                            <TableRow key={batch.id}>
                              <TableCell className='font-medium'>
                                <Link
                                  to='/enterprise-cdk/batches/$id'
                                  params={{ id: String(batch.id) }}
                                  className='hover:underline'
                                >
                                  {batch.name}
                                </Link>
                              </TableCell>
                              <TableCell>
                                {formatQuota(batch.quota, quotaPerUnit)}
                              </TableCell>
                              <TableCell>{batch.count}</TableCell>
                              <TableCell>
                                {batch.unused_count ??
                                  batch.stats?.unused_count ??
                                  0}
                              </TableCell>
                              <TableCell>
                                {batch.used_count ??
                                  batch.stats?.used_count ??
                                  0}
                              </TableCell>
                              <TableCell>
                                {formatTime(batch.expired_time, '永不过期')}
                              </TableCell>
                              <TableCell>
                                <div className='flex justify-end gap-2'>
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    onClick={() =>
                                      exportEnterpriseCdkCodes({
                                        batch_id: batch.id,
                                      })
                                    }
                                  >
                                    <Download />
                                    导出
                                  </Button>
                                  <Button
                                    variant='ghost'
                                    size='sm'
                                    onClick={() => openCreate(batch)}
                                  >
                                    <RotateCcw />
                                    再次创建
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {batchItems.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={7}
                                className='text-muted-foreground py-10 text-center'
                              >
                                暂无批次
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <PaginationControls
                      page={batches.data?.data?.page ?? batchesPage}
                      pageSize={batches.data?.data?.page_size}
                      total={batches.data?.data?.total}
                      onPageChange={setBatchesPage}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value='logs'>
                <Card>
                  <CardHeader>
                    <CardTitle>CDK 余额流水</CardTitle>
                    <CardDescription>
                      管理员授信、创建扣减和回收返还都会记录在这里。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table className='min-w-[760px]'>
                      <TableHeader>
                        <TableRow>
                          <TableHead>时间</TableHead>
                          <TableHead>类型</TableHead>
                          <TableHead>变动</TableHead>
                          <TableHead>变动后</TableHead>
                          <TableHead>关联批次</TableHead>
                          <TableHead>备注</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(logs.data?.data?.items ?? []).map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              {formatTime(log.created_time)}
                            </TableCell>
                            <TableCell>{log.type}</TableCell>
                            <TableCell>
                              {formatQuota(log.amount, quotaPerUnit)}
                            </TableCell>
                            <TableCell>
                              {formatQuota(log.balance_after, quotaPerUnit)}
                            </TableCell>
                            <TableCell>
                              {log.batch_name || log.related_batch_id || '-'}
                            </TableCell>
                            <TableCell className='max-w-[260px] truncate'>
                              {log.remark || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <PaginationControls
                      page={logs.data?.data?.page ?? logsPage}
                      pageSize={logs.data?.data?.page_size}
                      total={logs.data?.data?.total}
                      onPageChange={setLogsPage}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className='sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>创建企业 CDK</DialogTitle>
            <DialogDescription>
              余额扣减、批次记录和 CDK 生成会在同一个事务内完成。
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <Label>批次名称</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label>批次备注</Label>
              <Textarea
                value={form.remark}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    remark: event.target.value,
                  }))
                }
              />
            </div>
            <div className='grid gap-3 md:grid-cols-3'>
              <div className='grid gap-2'>
                <Label>单个面额 USD</Label>
                <Input
                  type='number'
                  min='0'
                  step='0.01'
                  value={form.quota}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      quota: event.target.value,
                    }))
                  }
                />
              </div>
              <div className='grid gap-2'>
                <Label>创建数量</Label>
                <Input
                  type='number'
                  min='1'
                  value={form.count}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      count: Number(event.target.value),
                    }))
                  }
                />
              </div>
              <div className='grid gap-2'>
                <Label>过期时间</Label>
                <Input
                  type='datetime-local'
                  value={formatDateTimeLocal(form.expired_time)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expired_time: event.target.value
                        ? Math.floor(
                            new Date(event.target.value).getTime() / 1000
                          )
                        : 0,
                    }))
                  }
                />
              </div>
            </div>
            <div className='bg-muted/50 rounded-lg border p-3 text-sm'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>本次扣减</span>
                <span className='font-medium'>
                  {formatQuota(totalQuota, quotaPerUnit)}
                </span>
              </div>
              <div className='mt-1 flex justify-between'>
                <span className='text-muted-foreground'>创建后余额</span>
                <span
                  className={
                    insufficient
                      ? 'text-destructive font-medium'
                      : 'font-medium'
                  }
                >
                  {formatQuota(remainingQuota, quotaPerUnit)}
                </span>
              </div>
              {insufficient && (
                <p className='text-destructive mt-2 text-xs'>
                  {enterpriseCdkContactMessage}
                </p>
              )}
              {exceedsCreateLimit && (
                <p className='text-destructive mt-2 text-xs'>
                  当前账号单次最多创建 {maxBatchCreateCount} 个 CDK。
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={createDisabled}
              onClick={() =>
                createMutation.mutate({
                  ...form,
                  name: form.name.trim(),
                })
              }
            >
              创建
            </Button>
          </DialogFooter>
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
  const totalCount = batch?.count ?? 0
  const usedPercent =
    totalCount > 0 ? Math.round((usedCount / totalCount) * 100) : 0

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
    await navigator.clipboard.writeText(text)
    toast.success(`已复制 ${res.data.count} 个未兑换 CDK`)
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {batch?.name ?? '批次详情'}
      </SectionPageLayout.Title>
      <SectionPageLayout.Description>
        查看 CDK 状态、兑换人邮箱，并导出所选兑换码。
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <Button variant='outline' disabled={!batch} onClick={copyUnused}>
          <Copy />
          一键复制未兑换
        </Button>
        <Button
          disabled={selectedIds.length === 0}
          onClick={() => exportEnterpriseCdkCodes({ cdk_ids: selectedIds })}
        >
          <Download />
          导出选中
        </Button>
        <Button
          variant='outline'
          disabled={!batch}
          onClick={() =>
            batch && exportEnterpriseCdkCodes({ batch_id: batch.id })
          }
        >
          <Download />
          导出全部
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <div className='grid gap-3 md:grid-cols-4'>
            <StatCard
              title='单个面额'
              value={formatQuota(batch?.quota, quotaPerUnit)}
            />
            <StatCard title='创建数量' value={String(batch?.count ?? 0)} />
            <StatCard
              title='已兑换'
              value={`${usedCount}/${totalCount}`}
              description={`${usedPercent}% 已领取`}
            />
            <StatCard
              title='过期时间'
              value={formatTime(batch?.expired_time, '永不过期')}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>CDK 明细</CardTitle>
              <CardDescription>
                {batch?.remark || '当前批次暂无备注'}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex flex-wrap gap-2'>
                {['all', 'unused', 'used', 'expired', 'disabled'].map(
                  (item) => (
                    <Button
                      key={item}
                      variant={statusFilter === item ? 'default' : 'outline'}
                      size='sm'
                      onClick={() => {
                        setStatusFilter(item)
                        setPage(1)
                      }}
                    >
                      <ListFilter />
                      {statusLabel(item)}
                    </Button>
                  )
                )}
                <div className='relative min-w-56'>
                  <Search className='text-muted-foreground absolute top-2 left-2 size-4' />
                  <Input
                    className='pl-8'
                    placeholder='搜索 CDK'
                    value={keyword}
                    onChange={(event) => {
                      setKeyword(event.target.value)
                      setPage(1)
                    }}
                  />
                </div>
              </div>
              <Table className='min-w-[960px]'>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'></TableHead>
                    <TableHead>CDK</TableHead>
                    <TableHead>面额</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>兑换人邮箱</TableHead>
                    <TableHead>兑换时间</TableHead>
                    <TableHead>创建时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell>
                        <input
                          type='checkbox'
                          checked={selectedIds.includes(code.id)}
                          onChange={() => toggleSelected(code.id)}
                        />
                      </TableCell>
                      <TableCell className='font-mono'>{code.key}</TableCell>
                      <TableCell>
                        {formatQuota(code.quota, quotaPerUnit)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getCodeStatusTone(code)}>
                          {getCodeStatus(code)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {code.used_user_email || code.used_user_id || '-'}
                      </TableCell>
                      <TableCell>{formatTime(code.redeemed_time)}</TableCell>
                      <TableCell>{formatTime(code.created_time)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className='flex items-center justify-end gap-2 text-sm'>
                <span className='text-muted-foreground'>
                  第 {pageInfo?.page ?? page} 页，共{' '}
                  {Math.max(
                    1,
                    Math.ceil(
                      (pageInfo?.total ?? 0) / (pageInfo?.page_size || 100)
                    )
                  )}{' '}
                  页
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={
                    page >=
                    Math.max(
                      1,
                      Math.ceil(
                        (pageInfo?.total ?? 0) / (pageInfo?.page_size || 100)
                      )
                    )
                  }
                  onClick={() => setPage((current) => current + 1)}
                >
                  下一页
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description?: string
}) {
  return (
    <Card size='sm'>
      <CardContent>
        <div className='text-muted-foreground text-xs font-medium'>{title}</div>
        <div className='mt-1 text-2xl font-semibold tracking-normal'>
          {value}
        </div>
        {description && (
          <div className='text-muted-foreground mt-1 text-xs'>
            {description}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MobileFact({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='mt-0.5 truncate text-sm font-medium'>{value}</div>
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

export { CDK_STATUS }
