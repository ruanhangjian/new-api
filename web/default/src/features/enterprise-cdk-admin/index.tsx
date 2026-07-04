import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  History,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Ticket,
  Wallet,
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
  adminAdjustEnterpriseCdkBalance,
  adminExportEnterpriseCdkCodes,
  adminGetEnterpriseCdkBalanceLogs,
  adminGetEnterpriseCdkBatches,
  adminGetEnterpriseCdkCodes,
  adminGetEnterpriseCdkOperationLogs,
  adminGetEnterpriseCdkUserDetail,
  adminGetEnterpriseCdkWhitelist,
  adminRecycleEnterpriseCdkCodes,
  adminSearchEnterpriseCdkUsers,
  adminSetEnterpriseCdkCodeDisabled,
  adminUpdateEnterpriseCdkLimit,
  adminUpdateEnterpriseCdkWhitelist,
} from '@/features/enterprise-cdk/api'
import { PaginationControls } from '@/features/enterprise-cdk/pagination-controls'
import type {
  EnterpriseCdkCode,
  EnterpriseCdkUserSearchResult,
} from '@/features/enterprise-cdk/types'
import {
  CDK_STATUS,
  formatEnterpriseCdkOperationAction,
  formatEnterpriseCdkQuotaLogType,
  formatQuota,
  formatSignedQuota,
  formatTime,
  getCodeStatus,
  getCodeStatusTone,
} from '@/features/enterprise-cdk/utils'

export function EnterpriseCdkAdminPage() {
  const queryClient = useQueryClient()
  const { status } = useStatus()
  const quotaPerUnit = status?.quota_per_unit
  const [whitelistUserId, setWhitelistUserId] = useState('')
  const [whitelistSearch, setWhitelistSearch] = useState('')
  const [limitDraft, setLimitDraft] = useState<Record<number, number>>({})
  const [balanceSearch, setBalanceSearch] = useState('')
  const [balanceForm, setBalanceForm] = useState({
    user_id: '',
    amount: '',
    type: 'admin_add',
    remark: '',
  })
  const [balanceLogUserId, setBalanceLogUserId] = useState('')
  const [batchCreatorSearch, setBatchCreatorSearch] = useState('')
  const [batchCreatorUserId, setBatchCreatorUserId] = useState('')
  const [codeFilters, setCodeFilters] = useState({
    user_id: '',
    batch_id: '',
    status: '',
    keyword: '',
    created_start: '',
    created_end: '',
  })
  const [codeCreatorSearch, setCodeCreatorSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [recycleRemark, setRecycleRemark] = useState('')
  const [customerUserId, setCustomerUserId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [whitelistPage, setWhitelistPage] = useState(1)
  const [batchesPage, setBatchesPage] = useState(1)
  const [balanceLogsPage, setBalanceLogsPage] = useState(1)
  const [codesPage, setCodesPage] = useState(1)
  const [operationLogsPage, setOperationLogsPage] = useState(1)
  const [customerLogsPage, setCustomerLogsPage] = useState(1)
  const [customerBatchesPage, setCustomerBatchesPage] = useState(1)

  const whitelist = useQuery({
    queryKey: ['enterprise-cdk-admin', 'whitelist', whitelistPage],
    queryFn: () => adminGetEnterpriseCdkWhitelist({ p: whitelistPage }),
  })
  const whitelistSearchQuery = useQuery({
    queryKey: [
      'enterprise-cdk-admin',
      'user-search',
      'whitelist',
      whitelistSearch,
    ],
    queryFn: () => adminSearchEnterpriseCdkUsers(whitelistSearch.trim()),
    enabled: whitelistSearch.trim().length > 0,
  })
  const balanceSearchQuery = useQuery({
    queryKey: ['enterprise-cdk-admin', 'user-search', 'balance', balanceSearch],
    queryFn: () => adminSearchEnterpriseCdkUsers(balanceSearch.trim()),
    enabled: balanceSearch.trim().length > 0,
  })
  const balanceLogs = useQuery({
    queryKey: [
      'enterprise-cdk-admin',
      'balance-logs',
      balanceLogUserId,
      balanceLogsPage,
    ],
    queryFn: () =>
      adminGetEnterpriseCdkBalanceLogs({
        p: balanceLogsPage,
        user_id: Number(balanceLogUserId) || undefined,
      }),
  })
  const batches = useQuery({
    queryKey: [
      'enterprise-cdk-admin',
      'batches',
      batchCreatorUserId,
      batchesPage,
    ],
    queryFn: () =>
      adminGetEnterpriseCdkBatches({
        p: batchesPage,
        user_id: Number(batchCreatorUserId) || undefined,
      }),
  })
  const batchCreatorSearchQuery = useQuery({
    queryKey: [
      'enterprise-cdk-admin',
      'user-search',
      'batches',
      batchCreatorSearch,
    ],
    queryFn: () => adminSearchEnterpriseCdkUsers(batchCreatorSearch.trim()),
    enabled: batchCreatorSearch.trim().length > 0,
  })
  const codes = useQuery({
    queryKey: ['enterprise-cdk-admin', 'codes', codeFilters, codesPage],
    queryFn: () =>
      adminGetEnterpriseCdkCodes({
        p: codesPage,
        user_id: codeFilters.user_id || undefined,
        batch_id: codeFilters.batch_id || undefined,
        status: codeFilters.status || undefined,
        keyword: codeFilters.keyword || undefined,
        created_start: dateTimeLocalToUnix(codeFilters.created_start),
        created_end: dateTimeLocalToUnix(codeFilters.created_end),
      }),
  })
  const codeCreatorSearchQuery = useQuery({
    queryKey: [
      'enterprise-cdk-admin',
      'user-search',
      'codes',
      codeCreatorSearch,
    ],
    queryFn: () => adminSearchEnterpriseCdkUsers(codeCreatorSearch.trim()),
    enabled: codeCreatorSearch.trim().length > 0,
  })
  const operationLogs = useQuery({
    queryKey: ['enterprise-cdk-admin', 'operation-logs', operationLogsPage],
    queryFn: () => adminGetEnterpriseCdkOperationLogs({ p: operationLogsPage }),
  })
  const customerDetail = useQuery({
    queryKey: [
      'enterprise-cdk-admin',
      'customer',
      customerUserId,
      customerLogsPage,
      customerBatchesPage,
    ],
    queryFn: () =>
      adminGetEnterpriseCdkUserDetail(Number(customerUserId), {
        logs_p: customerLogsPage,
        batches_p: customerBatchesPage,
      }),
    enabled: Number(customerUserId) > 0,
  })
  const customerSearchQuery = useQuery({
    queryKey: [
      'enterprise-cdk-admin',
      'user-search',
      'customer',
      customerSearch,
    ],
    queryFn: () => adminSearchEnterpriseCdkUsers(customerSearch.trim()),
    enabled: customerSearch.trim().length > 0,
  })

  const invalidateAdmin = () => {
    queryClient.invalidateQueries({ queryKey: ['enterprise-cdk-admin'] })
  }

  const selectCustomerUser = (userId: string) => {
    setCustomerUserId(userId)
    setCustomerLogsPage(1)
    setCustomerBatchesPage(1)
  }

  const whitelistMutation = useMutation({
    mutationFn: adminUpdateEnterpriseCdkWhitelist,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success('白名单已更新')
      setWhitelistUserId('')
      invalidateAdmin()
    },
  })
  const limitMutation = useMutation({
    mutationFn: ({ userId, max }: { userId: number; max: number }) =>
      adminUpdateEnterpriseCdkLimit(userId, max),
    onSuccess: (res) => {
      if (!res.success) return
      toast.success('创建上限已更新')
      invalidateAdmin()
    },
  })
  const balanceMutation = useMutation({
    mutationFn: adminAdjustEnterpriseCdkBalance,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success('CDK 余额已调整')
      setBalanceForm({ user_id: '', amount: '', type: 'admin_add', remark: '' })
      invalidateAdmin()
    },
  })
  const recycleMutation = useMutation({
    mutationFn: adminRecycleEnterpriseCdkCodes,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(`已回收 ${res.data?.refunded_count ?? 0} 个 CDK`)
      setSelectedIds([])
      setRecycleRemark('')
      invalidateAdmin()
    },
  })
  const disableMutation = useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      adminSetEnterpriseCdkCodeDisabled(id, disabled),
    onSuccess: (res) => {
      if (!res.success) return
      toast.success('CDK 状态已更新')
      invalidateAdmin()
    },
  })

  const codeItems = codes.data?.data?.items ?? []
  const selectedCodes = codeItems.filter((code) =>
    selectedIds.includes(code.id)
  )
  const selectedRefundQuota = selectedCodes
    .filter(isEnterpriseCdkCodeRecyclable)
    .reduce((sum, code) => sum + code.quota, 0)
  const balanceAmount = Number(balanceForm.amount)
  const balanceSubmitDisabled =
    balanceMutation.isPending ||
    !Number(balanceForm.user_id) ||
    !Number.isFinite(balanceAmount) ||
    balanceAmount <= 0 ||
    balanceForm.remark.trim() === ''
  const exportCodeFilters = () => ({
    user_id: Number(codeFilters.user_id) || undefined,
    batch_id: Number(codeFilters.batch_id) || undefined,
    status: codeFilters.status || undefined,
    keyword: codeFilters.keyword || undefined,
    created_start: dateTimeLocalToUnix(codeFilters.created_start),
    created_end: dateTimeLocalToUnix(codeFilters.created_end),
  })
  const toggleSelected = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }
  const updateCodeFilters = (patch: Partial<typeof codeFilters>) => {
    setCodeFilters((current) => ({ ...current, ...patch }))
    setCodesPage(1)
    setSelectedIds([])
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>企业 CDK 管理</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        管理白名单、CDK 余额、全局 CDK、回收返还和操作审计。
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <Tabs defaultValue='whitelist'>
          <TabsList variant='line' className='mb-4 flex-wrap'>
            <TabsTrigger value='whitelist'>
              <ShieldCheck />
              白名单
            </TabsTrigger>
            <TabsTrigger value='balance'>
              <Wallet />
              余额
            </TabsTrigger>
            <TabsTrigger value='logs'>
              <History />
              余额流水
            </TabsTrigger>
            <TabsTrigger value='batches'>
              <Ticket />
              批次
            </TabsTrigger>
            <TabsTrigger value='codes'>
              <Ticket />
              全局 CDK
            </TabsTrigger>
            <TabsTrigger value='customer'>
              <Search />
              客户详情
            </TabsTrigger>
            <TabsTrigger value='operations'>
              <Settings2 />
              操作日志
            </TabsTrigger>
          </TabsList>

          <TabsContent value='whitelist'>
            <Card>
              <CardHeader>
                <CardTitle>白名单配置</CardTitle>
                <CardDescription>
                  第一版采用白名单控制企业 CDK 自助创建权限。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-3'>
                  <div className='flex flex-wrap gap-2'>
                    <Input
                      className='max-w-72'
                      placeholder='搜索用户邮箱或 ID'
                      value={whitelistSearch}
                      onChange={(event) =>
                        setWhitelistSearch(event.target.value)
                      }
                    />
                  </div>
                  <UserSearchResults
                    users={whitelistSearchQuery.data?.data?.items ?? []}
                    quotaPerUnit={quotaPerUnit}
                    actionLabel='加入白名单'
                    onSelect={(user) =>
                      whitelistMutation.mutate({
                        action: 'add',
                        user_id: user.id,
                      })
                    }
                  />
                </div>
                <div className='flex flex-wrap gap-2 border-t pt-4'>
                  <Input
                    className='max-w-64'
                    placeholder='直接输入用户 ID'
                    value={whitelistUserId}
                    onChange={(event) => setWhitelistUserId(event.target.value)}
                  />
                  <Button
                    onClick={() =>
                      whitelistMutation.mutate({
                        action: 'add',
                        user_id: Number(whitelistUserId),
                      })
                    }
                  >
                    添加白名单
                  </Button>
                </div>
                <Table className='min-w-[920px]'>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>邮箱</TableHead>
                      <TableHead>当前余额</TableHead>
                      <TableHead>加入时间</TableHead>
                      <TableHead>单次上限</TableHead>
                      <TableHead className='text-right'>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(whitelist.data?.data?.items ?? []).map((item) => (
                      <TableRow key={item.user_id}>
                        <TableCell>{item.user_id}</TableCell>
                        <TableCell>{item.email || item.username}</TableCell>
                        <TableCell>
                          {formatQuota(item.enterprise_cdk_quota, quotaPerUnit)}
                        </TableCell>
                        <TableCell>{formatTime(item.created_time)}</TableCell>
                        <TableCell>
                          <Input
                            className='w-24'
                            type='number'
                            value={
                              limitDraft[item.user_id] ??
                              item.max_batch_create_count
                            }
                            onChange={(event) =>
                              setLimitDraft((current) => ({
                                ...current,
                                [item.user_id]: Number(event.target.value),
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className='flex justify-end gap-2'>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() =>
                                limitMutation.mutate({
                                  userId: item.user_id,
                                  max:
                                    limitDraft[item.user_id] ??
                                    item.max_batch_create_count,
                                })
                              }
                            >
                              保存上限
                            </Button>
                            <Button
                              variant='destructive'
                              size='sm'
                              onClick={() =>
                                whitelistMutation.mutate({
                                  action: 'remove',
                                  user_id: item.user_id,
                                })
                              }
                            >
                              移除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PaginationControls
                  page={whitelist.data?.data?.page ?? whitelistPage}
                  pageSize={whitelist.data?.data?.page_size}
                  total={whitelist.data?.data?.total}
                  onPageChange={setWhitelistPage}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='balance'>
            <Card>
              <CardHeader>
                <CardTitle>CDK 余额管理</CardTitle>
                <CardDescription>
                  线下收款后手动增加或扣减企业 CDK 余额，备注必填。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-3'>
                  <Input
                    className='max-w-72'
                    placeholder='搜索用户邮箱或 ID'
                    value={balanceSearch}
                    onChange={(event) => setBalanceSearch(event.target.value)}
                  />
                  <UserSearchResults
                    users={balanceSearchQuery.data?.data?.items ?? []}
                    quotaPerUnit={quotaPerUnit}
                    actionLabel='选择调整'
                    onSelect={(user) =>
                      setBalanceForm((current) => ({
                        ...current,
                        user_id: String(user.id),
                      }))
                    }
                  />
                </div>
                <div className='grid gap-4 border-t pt-4 md:grid-cols-[220px_180px_180px_1fr_auto]'>
                  <div className='grid gap-2'>
                    <Label>用户 ID</Label>
                    <Input
                      value={balanceForm.user_id}
                      onChange={(event) =>
                        setBalanceForm((current) => ({
                          ...current,
                          user_id: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='grid gap-2'>
                    <Label>金额 USD</Label>
                    <Input
                      value={balanceForm.amount}
                      onChange={(event) =>
                        setBalanceForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='grid gap-2'>
                    <Label>类型</Label>
                    <select
                      className='border-input h-8 rounded-lg border bg-transparent px-2 text-sm'
                      value={balanceForm.type}
                      onChange={(event) =>
                        setBalanceForm((current) => ({
                          ...current,
                          type: event.target.value,
                        }))
                      }
                    >
                      <option value='admin_add'>管理员充值</option>
                      <option value='admin_deduct'>管理员扣减</option>
                      <option value='admin_refund'>管理员退款</option>
                    </select>
                  </div>
                  <div className='grid gap-2'>
                    <Label>备注</Label>
                    <Input
                      placeholder='微信收款 ¥700，2026-07-03'
                      value={balanceForm.remark}
                      onChange={(event) =>
                        setBalanceForm((current) => ({
                          ...current,
                          remark: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='flex items-end'>
                    <Button
                      disabled={balanceSubmitDisabled}
                      onClick={() =>
                        balanceMutation.mutate({
                          user_id: Number(balanceForm.user_id),
                          amount: balanceForm.amount,
                          type: balanceForm.type,
                          remark: balanceForm.remark,
                        })
                      }
                    >
                      提交
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='logs'>
            <div className='space-y-3'>
              <div className='flex flex-wrap gap-2'>
                <Input
                  className='max-w-48'
                  placeholder='用户 ID'
                  value={balanceLogUserId}
                  onChange={(event) => {
                    setBalanceLogUserId(event.target.value)
                    setBalanceLogsPage(1)
                  }}
                />
                <Button variant='outline' onClick={() => balanceLogs.refetch()}>
                  <RefreshCw />
                  刷新
                </Button>
              </div>
              <DataTable
                title='全局余额流水'
                description='展示所有企业客户的 CDK 余额变动。'
                headers={[
                  '时间',
                  '用户',
                  '类型',
                  '变动',
                  '变动前',
                  '变动后',
                  '备注',
                ]}
                rows={(balanceLogs.data?.data?.items ?? []).map((item) => [
                  formatTime(item.created_time),
                  item.user_email || item.user_id,
                  formatEnterpriseCdkQuotaLogType(item.type),
                  formatSignedQuota(item.amount, quotaPerUnit),
                  formatQuota(item.balance_before, quotaPerUnit),
                  formatQuota(item.balance_after, quotaPerUnit),
                  item.remark || '-',
                ])}
                footer={
                  <PaginationControls
                    page={balanceLogs.data?.data?.page ?? balanceLogsPage}
                    pageSize={balanceLogs.data?.data?.page_size}
                    total={balanceLogs.data?.data?.total}
                    onPageChange={setBalanceLogsPage}
                  />
                }
              />
            </div>
          </TabsContent>

          <TabsContent value='batches'>
            <div className='space-y-3'>
              <div className='space-y-3'>
                <Input
                  className='max-w-72'
                  placeholder='搜索创建人邮箱或 ID'
                  value={batchCreatorSearch}
                  onChange={(event) =>
                    setBatchCreatorSearch(event.target.value)
                  }
                />
                <UserSearchResults
                  users={batchCreatorSearchQuery.data?.data?.items ?? []}
                  quotaPerUnit={quotaPerUnit}
                  actionLabel='设为筛选'
                  onSelect={(user) => {
                    setBatchCreatorUserId(String(user.id))
                    setBatchesPage(1)
                  }}
                />
              </div>
              <div className='flex flex-wrap gap-2'>
                <Input
                  className='max-w-40'
                  placeholder='创建人用户 ID'
                  value={batchCreatorUserId}
                  onChange={(event) => {
                    setBatchCreatorUserId(event.target.value)
                    setBatchesPage(1)
                  }}
                />
                <Button variant='outline' onClick={() => batches.refetch()}>
                  <RefreshCw />
                  刷新
                </Button>
              </div>
              <DataTable
                title='全局批次列表'
                description='按企业负责人查看所有企业 CDK 批次及兑换统计。'
                minWidth={1080}
                headers={[
                  '批次 ID',
                  '批次名称',
                  '创建人',
                  '单个面额',
                  '数量',
                  '未兑换',
                  '已兑换',
                  '已过期',
                  '已禁用',
                  '总面额',
                  '创建时间',
                ]}
                rows={(batches.data?.data?.items ?? []).map((item) => [
                  item.id,
                  item.name,
                  item.creator_email || item.creator_user_id,
                  formatQuota(item.quota, quotaPerUnit),
                  item.count,
                  item.unused_count ?? item.stats?.unused_count ?? 0,
                  item.used_count ?? item.stats?.used_count ?? 0,
                  item.expired_count ?? item.stats?.expired_count ?? 0,
                  item.disabled_count ?? item.stats?.disabled_count ?? 0,
                  formatQuota(item.total_quota, quotaPerUnit),
                  formatTime(item.created_time),
                ])}
                footer={
                  <PaginationControls
                    page={batches.data?.data?.page ?? batchesPage}
                    pageSize={batches.data?.data?.page_size}
                    total={batches.data?.data?.total}
                    onPageChange={setBatchesPage}
                  />
                }
              />
            </div>
          </TabsContent>

          <TabsContent value='codes'>
            <Card>
              <CardHeader>
                <CardTitle>全局 CDK 列表</CardTitle>
                <CardDescription>
                  按创建人、批次、状态或 CDK 码筛选，并支持导出和回收。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-3'>
                  <Input
                    className='max-w-72'
                    placeholder='搜索创建人邮箱或 ID'
                    value={codeCreatorSearch}
                    onChange={(event) =>
                      setCodeCreatorSearch(event.target.value)
                    }
                  />
                  <UserSearchResults
                    users={codeCreatorSearchQuery.data?.data?.items ?? []}
                    quotaPerUnit={quotaPerUnit}
                    actionLabel='设为筛选'
                    onSelect={(user) =>
                      updateCodeFilters({
                        user_id: String(user.id),
                      })
                    }
                  />
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Input
                    className='max-w-32'
                    placeholder='用户 ID'
                    value={codeFilters.user_id}
                    onChange={(event) =>
                      updateCodeFilters({
                        user_id: event.target.value,
                      })
                    }
                  />
                  <Input
                    className='max-w-32'
                    placeholder='批次 ID'
                    value={codeFilters.batch_id}
                    onChange={(event) =>
                      updateCodeFilters({
                        batch_id: event.target.value,
                      })
                    }
                  />
                  <select
                    className='border-input h-8 rounded-lg border bg-transparent px-2 text-sm'
                    value={codeFilters.status}
                    onChange={(event) =>
                      updateCodeFilters({
                        status: event.target.value,
                      })
                    }
                  >
                    <option value=''>全部状态</option>
                    <option value='unused'>未兑换</option>
                    <option value='used'>已兑换</option>
                    <option value='expired'>已过期</option>
                    <option value='disabled'>已禁用</option>
                  </select>
                  <Input
                    className='max-w-56'
                    placeholder='搜索 CDK'
                    value={codeFilters.keyword}
                    onChange={(event) =>
                      updateCodeFilters({
                        keyword: event.target.value,
                      })
                    }
                  />
                  <Input
                    aria-label='创建开始时间'
                    className='max-w-48'
                    title='创建开始时间'
                    type='datetime-local'
                    value={codeFilters.created_start}
                    onChange={(event) =>
                      updateCodeFilters({
                        created_start: event.target.value,
                      })
                    }
                  />
                  <Input
                    aria-label='创建结束时间'
                    className='max-w-48'
                    title='创建结束时间'
                    type='datetime-local'
                    value={codeFilters.created_end}
                    onChange={(event) =>
                      updateCodeFilters({
                        created_end: event.target.value,
                      })
                    }
                  />
                  <Button variant='outline' onClick={() => codes.refetch()}>
                    <RefreshCw />
                    刷新
                  </Button>
                  <Button
                    onClick={() =>
                      adminExportEnterpriseCdkCodes(exportCodeFilters())
                    }
                  >
                    <Download />
                    导出
                  </Button>
                  <Button
                    variant='outline'
                    disabled={selectedIds.length === 0}
                    onClick={() =>
                      adminExportEnterpriseCdkCodes({ cdk_ids: selectedIds })
                    }
                  >
                    <Download />
                    导出选中
                  </Button>
                </div>
                <div className='flex flex-wrap items-end gap-2'>
                  <Textarea
                    className='max-w-md'
                    placeholder='回收备注'
                    value={recycleRemark}
                    onChange={(event) => setRecycleRemark(event.target.value)}
                  />
                  <div className='text-muted-foreground min-w-48 text-sm'>
                    已选 {selectedIds.length} 个，预计返还{' '}
                    {formatQuota(selectedRefundQuota, quotaPerUnit)}
                  </div>
                  <Button
                    variant='destructive'
                    disabled={
                      selectedIds.length === 0 || recycleRemark.trim() === ''
                    }
                    onClick={() =>
                      recycleMutation.mutate({
                        cdk_ids: selectedIds,
                        remark: recycleRemark,
                      })
                    }
                  >
                    <RotateCcw />
                    回收选中
                  </Button>
                </div>
                <Table className='min-w-[1280px]'>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>CDK</TableHead>
                      <TableHead>创建人</TableHead>
                      <TableHead>批次</TableHead>
                      <TableHead>面额</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>兑换人</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>过期时间</TableHead>
                      <TableHead>兑换时间</TableHead>
                      <TableHead className='text-right'>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codeItems.map((code) => {
                      const isRecycled = (code.recycled_time ?? 0) > 0
                      return (
                        <TableRow key={code.id}>
                          <TableCell>
                            <input
                              type='checkbox'
                              checked={selectedIds.includes(code.id)}
                              disabled={!isEnterpriseCdkCodeRecyclable(code)}
                              onChange={() => toggleSelected(code.id)}
                            />
                          </TableCell>
                          <TableCell className='font-mono'>
                            {code.key}
                          </TableCell>
                          <TableCell>
                            {code.creator_email || code.user_id}
                          </TableCell>
                          <TableCell>
                            {code.batch_name || code.batch_id}
                          </TableCell>
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
                          <TableCell>{formatTime(code.created_time)}</TableCell>
                          <TableCell>
                            {formatTime(code.expired_time, '永不过期')}
                          </TableCell>
                          <TableCell>
                            {formatTime(code.redeemed_time)}
                          </TableCell>
                          <TableCell>
                            <div className='flex justify-end'>
                              <Button
                                variant='outline'
                                size='sm'
                                disabled={
                                  isRecycled ||
                                  disableMutation.isPending ||
                                  (code.status !== CDK_STATUS.enabled &&
                                    code.status !== CDK_STATUS.disabled)
                                }
                                onClick={() =>
                                  disableMutation.mutate({
                                    id: code.id,
                                    disabled:
                                      code.status !== CDK_STATUS.disabled,
                                  })
                                }
                              >
                                {isRecycled
                                  ? '已回收'
                                  : code.status === CDK_STATUS.disabled
                                    ? '启用'
                                    : '禁用'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <PaginationControls
                  page={codes.data?.data?.page ?? codesPage}
                  pageSize={codes.data?.data?.page_size}
                  total={codes.data?.data?.total}
                  onPageChange={(nextPage) => {
                    setCodesPage(nextPage)
                    setSelectedIds([])
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='customer'>
            <Card>
              <CardHeader>
                <CardTitle>企业客户详情</CardTitle>
                <CardDescription>
                  输入用户 ID 查看余额、流水和批次概览。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-3'>
                  <div className='flex flex-wrap gap-2'>
                    <Input
                      className='max-w-72'
                      placeholder='搜索用户邮箱或 ID'
                      value={customerSearch}
                      onChange={(event) =>
                        setCustomerSearch(event.target.value)
                      }
                    />
                    <Button
                      variant='outline'
                      disabled={!Number(customerSearch)}
                      onClick={() => selectCustomerUser(customerSearch)}
                    >
                      <Search />按 ID 查询
                    </Button>
                  </div>
                  <UserSearchResults
                    users={customerSearchQuery.data?.data?.items ?? []}
                    quotaPerUnit={quotaPerUnit}
                    actionLabel='查看详情'
                    onSelect={(user) => selectCustomerUser(String(user.id))}
                  />
                </div>
                <div className='flex gap-2 border-t pt-4'>
                  <Input
                    className='max-w-64'
                    placeholder='用户 ID'
                    value={customerUserId}
                    onChange={(event) => selectCustomerUser(event.target.value)}
                  />
                  <Button onClick={() => customerDetail.refetch()}>
                    <Search />
                    查询
                  </Button>
                </div>
                {customerDetail.data?.data && (
                  <div className='grid gap-3 md:grid-cols-3'>
                    <MiniCard
                      title='用户邮箱'
                      value={customerDetail.data.data.user.email || '-'}
                    />
                    <MiniCard
                      title='当前余额'
                      value={customerDetail.data.data.user.balance}
                    />
                    <MiniCard
                      title='批次数'
                      value={String(
                        customerDetail.data.data.customer_summary.batch_count
                      )}
                    />
                    <MiniCard
                      title='历史充值'
                      value={formatQuota(
                        customerDetail.data.data.quota_summary
                          .total_charged_quota,
                        quotaPerUnit
                      )}
                    />
                    <MiniCard
                      title='历史消耗'
                      value={formatQuota(
                        customerDetail.data.data.quota_summary
                          .total_consumed_quota,
                        quotaPerUnit
                      )}
                    />
                    <MiniCard
                      title='兑换进度'
                      value={`${customerDetail.data.data.customer_summary.redeemed_cdks}/${customerDetail.data.data.customer_summary.total_cdks}`}
                    />
                  </div>
                )}
                <DataTable
                  title='客户最近批次'
                  headers={['批次', '数量', '总面额', '创建时间']}
                  rows={(
                    customerDetail.data?.data?.batches_page?.items ??
                    customerDetail.data?.data?.batches ??
                    []
                  ).map((item) => [
                    item.name,
                    item.count,
                    formatQuota(item.total_quota, quotaPerUnit),
                    formatTime(item.created_time),
                  ])}
                  footer={
                    <PaginationControls
                      page={
                        customerDetail.data?.data?.batches_page?.page ??
                        customerBatchesPage
                      }
                      pageSize={
                        customerDetail.data?.data?.batches_page?.page_size
                      }
                      total={customerDetail.data?.data?.batches_page?.total}
                      onPageChange={setCustomerBatchesPage}
                    />
                  }
                />
                <DataTable
                  title='客户余额流水'
                  headers={['时间', '类型', '变动', '变动后', '备注']}
                  rows={(
                    customerDetail.data?.data?.logs_page?.items ??
                    customerDetail.data?.data?.logs ??
                    []
                  ).map((item) => [
                    formatTime(item.created_time),
                    formatEnterpriseCdkQuotaLogType(item.type),
                    formatSignedQuota(item.amount, quotaPerUnit),
                    formatQuota(item.balance_after, quotaPerUnit),
                    item.remark || '-',
                  ])}
                  footer={
                    <PaginationControls
                      page={
                        customerDetail.data?.data?.logs_page?.page ??
                        customerLogsPage
                      }
                      pageSize={customerDetail.data?.data?.logs_page?.page_size}
                      total={customerDetail.data?.data?.logs_page?.total}
                      onPageChange={setCustomerLogsPage}
                    />
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='operations'>
            <DataTable
              title='操作日志'
              description='导出、复制、回收、白名单和上限变更都会进入审计。'
              headers={[
                '时间',
                '操作',
                '管理员',
                '目标用户',
                '批次',
                '数量',
                '备注',
              ]}
              rows={(operationLogs.data?.data?.items ?? []).map((item) => [
                formatTime(item.created_time),
                formatEnterpriseCdkOperationAction(item.action),
                item.operator_email || item.operator_id,
                item.target_user_email || item.target_user_id || '-',
                item.batch_name || item.batch_id || '-',
                item.cdk_count,
                item.remark || item.request_summary || '-',
              ])}
              footer={
                <PaginationControls
                  page={operationLogs.data?.data?.page ?? operationLogsPage}
                  pageSize={operationLogs.data?.data?.page_size}
                  total={operationLogs.data?.data?.total}
                  onPageChange={setOperationLogsPage}
                />
              }
            />
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function UserSearchResults({
  users,
  quotaPerUnit,
  actionLabel,
  onSelect,
}: {
  users: EnterpriseCdkUserSearchResult[]
  quotaPerUnit?: number
  actionLabel: string
  onSelect: (user: EnterpriseCdkUserSearchResult) => void
}) {
  if (users.length === 0) {
    return null
  }

  return (
    <div className='border-border divide-border max-w-2xl divide-y rounded-md border'>
      {users.map((user) => (
        <div
          key={user.id}
          className='flex flex-wrap items-center gap-3 px-3 py-2'
        >
          <div className='min-w-0 flex-1'>
            <div className='truncate text-sm font-medium'>
              {user.email || user.username}
            </div>
            <div className='text-muted-foreground text-xs'>
              ID: {user.id} · 当前 CDK 余额{' '}
              {formatQuota(user.enterprise_cdk_quota ?? 0, quotaPerUnit)}
            </div>
          </div>
          <Button size='sm' variant='outline' onClick={() => onSelect(user)}>
            {actionLabel}
          </Button>
        </div>
      ))}
    </div>
  )
}

function MiniCard({ title, value }: { title: string; value: string }) {
  return (
    <Card size='sm'>
      <CardContent>
        <div className='text-muted-foreground text-xs'>{title}</div>
        <div className='mt-1 text-lg font-medium'>{value}</div>
      </CardContent>
    </Card>
  )
}

function DataTable({
  title,
  description,
  headers,
  rows,
  footer,
  minWidth = 760,
}: {
  title: string
  description?: string
  headers: string[]
  rows: Array<Array<string | number>>
  footer?: ReactNode
  minWidth?: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <Table style={{ minWidth }}>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={headers.length}
                  className='text-muted-foreground py-10 text-center'
                >
                  暂无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {footer}
      </CardContent>
    </Card>
  )
}

function dateTimeLocalToUnix(value: string) {
  if (!value) return undefined
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return undefined
  return Math.floor(timestamp / 1000)
}

function isEnterpriseCdkCodeRecyclable(code: EnterpriseCdkCode) {
  if ((code.recycled_time ?? 0) > 0) return false
  return code.status !== CDK_STATUS.used
}
