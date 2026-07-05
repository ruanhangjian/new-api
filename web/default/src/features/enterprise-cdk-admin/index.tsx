import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useStatus } from '@/hooks/use-status'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout'
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
  ENTERPRISE_CDK_HARD_MAX_BATCH_CREATE_COUNT,
  ENTERPRISE_CDK_QUOTA_LOG_TYPE_OPTIONS,
  calculateEnterpriseCdkAdjustedBalance,
  formatEnterpriseCdkAuthorizedCount,
  formatEnterpriseCdkBalanceActionLabel,
  formatEnterpriseCdkOperationAction,
  formatEnterpriseCdkQuotaLogType,
  formatQuota,
  formatSignedQuota,
  formatTime,
  getCodeStatus,
} from '@/features/enterprise-cdk/utils'

const ENTERPRISE_CDK_BALANCE_ADJUST_TYPES = [
  { value: 'admin_add', label: '增加余额' },
  { value: 'admin_deduct', label: '扣减余额' },
  { value: 'admin_refund', label: '退款返还' },
]

const ENTERPRISE_CDK_CODE_STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'unused', label: '未兑换' },
  { value: 'used', label: '已兑换' },
  { value: 'expired', label: '已过期' },
  { value: 'disabled', label: '已禁用' },
]

const ADMIN_INPUT_CLASS =
  'h-[34px] rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'

export function EnterpriseCdkAdminPage() {
  const queryClient = useQueryClient()
  const { status } = useStatus()
  const quotaPerUnit = status?.quota_per_unit
  const [activeTab, setActiveTab] = useState('whitelist')
  const [whitelistAddOpen, setWhitelistAddOpen] = useState(false)
  const [whitelistAddSearch, setWhitelistAddSearch] = useState('')
  const [selectedWhitelistUser, setSelectedWhitelistUser] =
    useState<EnterpriseCdkUserSearchResult | null>(null)
  const [whitelistInitialBalance, setWhitelistInitialBalance] = useState('')
  const [whitelistRemark, setWhitelistRemark] = useState('')
  const [limitDraft, setLimitDraft] = useState<Record<number, number>>({})
  const [balanceSearch, setBalanceSearch] = useState('')
  const [balanceAdjustOpen, setBalanceAdjustOpen] = useState(false)
  const [balanceForm, setBalanceForm] = useState({
    user_id: '',
    amount: '',
    type: 'admin_add',
    remark: '',
  })
  const [balanceLogUserId, setBalanceLogUserId] = useState('')
  const [balanceLogType, setBalanceLogType] = useState('all')
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
  const [customerSubTab, setCustomerSubTab] = useState('logs')
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
      whitelistAddSearch,
    ],
    queryFn: () => adminSearchEnterpriseCdkUsers(whitelistAddSearch.trim()),
    enabled: whitelistAddSearch.trim().length > 0,
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
      balanceLogType,
      balanceLogsPage,
    ],
    queryFn: () =>
      adminGetEnterpriseCdkBalanceLogs({
        p: balanceLogsPage,
        user_id: Number(balanceLogUserId) || undefined,
        type: balanceLogType === 'all' ? undefined : balanceLogType,
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
  const resetWhitelistAddModal = () => {
    setWhitelistAddSearch('')
    setSelectedWhitelistUser(null)
    setWhitelistInitialBalance('')
    setWhitelistRemark('')
  }
  const handleWhitelistAddOpenChange = (open: boolean) => {
    setWhitelistAddOpen(open)
    if (!open) resetWhitelistAddModal()
  }
  const resetBalanceAdjustModal = () => {
    setBalanceForm({ user_id: '', amount: '', type: 'admin_add', remark: '' })
  }
  const handleBalanceAdjustOpenChange = (open: boolean) => {
    setBalanceAdjustOpen(open)
    if (!open) resetBalanceAdjustModal()
  }
  const showCustomerDetail = (userId: number) => {
    selectCustomerUser(String(userId))
    setActiveTab('customer')
  }
  const showBalanceAdjust = (userId: number) => {
    setBalanceForm({
      user_id: String(userId),
      amount: '',
      type: 'admin_add',
      remark: '',
    })
    setBalanceAdjustOpen(true)
  }

  const whitelistMutation = useMutation({
    mutationFn: adminUpdateEnterpriseCdkWhitelist,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success('白名单已更新')
      invalidateAdmin()
    },
  })
  const addWhitelistMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWhitelistUser) {
        throw new Error('请先选择企业用户')
      }
      const addRes = await adminUpdateEnterpriseCdkWhitelist({
        action: 'add',
        user_id: selectedWhitelistUser.id,
      })
      if (!addRes.success) {
        throw new Error(addRes.message || '加入白名单失败')
      }
      const initialBalance = Number(whitelistInitialBalance)
      if (
        whitelistInitialBalance.trim() &&
        Number.isFinite(initialBalance) &&
        initialBalance > 0
      ) {
        const balanceRes = await adminAdjustEnterpriseCdkBalance({
          user_id: selectedWhitelistUser.id,
          amount: whitelistInitialBalance,
          type: 'admin_add',
          remark:
            whitelistRemark.trim() ||
            `添加企业用户初始充值：${getEnterpriseCdkUserDisplayName(
              selectedWhitelistUser
            )}`,
        })
        if (!balanceRes.success) {
          throw new Error(balanceRes.message || '初始 CDK 余额充值失败')
        }
      }
    },
    onSuccess: () => {
      toast.success('企业用户已加入白名单')
      handleWhitelistAddOpenChange(false)
      invalidateAdmin()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '加入白名单失败')
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
      handleBalanceAdjustOpenChange(false)
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
  const whitelistItems = whitelist.data?.data?.items ?? []
  const whitelistTotal = whitelist.data?.data?.total ?? whitelistItems.length
  const balanceSearchResults = balanceSearchQuery.data?.data?.items ?? []
  const selectedBalanceUserId = Number(balanceForm.user_id) || 0
  const selectedBalanceWhitelistUser = whitelistItems.find(
    (item) => item.user_id === selectedBalanceUserId
  )
  const selectedBalanceSearchUser = balanceSearchResults.find(
    (item) => item.id === selectedBalanceUserId
  )
  const selectedBalanceUserName =
    selectedBalanceWhitelistUser?.email ||
    selectedBalanceWhitelistUser?.username ||
    selectedBalanceSearchUser?.email ||
    selectedBalanceSearchUser?.username ||
    (selectedBalanceUserId ? String(selectedBalanceUserId) : '')
  const selectedBalanceUserQuota =
    selectedBalanceWhitelistUser?.enterprise_cdk_quota ??
    selectedBalanceSearchUser?.enterprise_cdk_quota ??
    0
  const selectedBalanceAdjustedQuota = calculateEnterpriseCdkAdjustedBalance(
    selectedBalanceUserQuota,
    balanceForm.amount,
    balanceForm.type,
    quotaPerUnit
  )
  const whitelistInitialBalanceNumber = Number(whitelistInitialBalance)
  const whitelistInitialBalanceInvalid =
    whitelistInitialBalance.trim() !== '' &&
    (!Number.isFinite(whitelistInitialBalanceNumber) ||
      whitelistInitialBalanceNumber <= 0)
  const addWhitelistDisabled =
    addWhitelistMutation.isPending ||
    !selectedWhitelistUser ||
    whitelistInitialBalanceInvalid
  const customerData = customerDetail.data?.data
  const customerBatches =
    customerData?.batches_page?.items ?? customerData?.batches ?? []
  const customerLogs = customerData?.logs_page?.items ?? customerData?.logs ?? []

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
                企业 CDK 管理
              </div>
              <div className='text-[13.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                白名单配置、额度管理、全局 CDK 审计
              </div>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => value && setActiveTab(value)}
          >
            <TabsList
              variant='line'
              className='mb-5 flex h-auto w-full items-stretch justify-start gap-0 rounded-none border-b border-[#e2e8f0] dark:border-border bg-transparent p-0 text-[#64748b] dark:text-muted-foreground'
            >
              {[
                ['whitelist', '白名单'],
                ['balance', '余额管理'],
                ['logs', '余额流水'],
                ['batches', '批次'],
                ['codes', '全局 CDK'],
                ['customer', '客户详情'],
                ['operations', '操作日志'],
              ].map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className='mb-[-1px] h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-4 py-[10px] text-[13.5px] leading-5 font-medium text-[#64748b] dark:text-muted-foreground shadow-none transition-colors after:hidden hover:text-[#0f172a] dark:hover:text-foreground data-active:border-[#0f172a] dark:data-active:border-foreground data-active:bg-transparent data-active:font-semibold data-active:text-[#0f172a] dark:data-active:text-foreground data-active:shadow-none'
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

          <TabsContent value='whitelist'>
            <div className='space-y-4'>
              <div className='flex items-center justify-between gap-4'>
                <div className='text-[13.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                  {formatEnterpriseCdkAuthorizedCount(whitelistTotal)}
                </div>
                <button
                  type='button'
                  className='inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary px-[14px] text-[13.5px] leading-5 font-medium whitespace-nowrap text-white dark:text-primary-foreground transition-colors hover:bg-[#1e293b] dark:hover:bg-primary/90'
                  onClick={() => setWhitelistAddOpen(true)}
                >
                  <Plus className='size-[14px]' />
                  添加企业用户
                </button>
              </div>

              <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                <table className='w-full min-w-[1180px] border-collapse'>
                  <thead>
                    <tr>
                      <AdminTableHead>用户</AdminTableHead>
                      <AdminTableHead>用户 ID</AdminTableHead>
                      <AdminTableHead>当前 CDK 余额</AdminTableHead>
                      <AdminTableHead>加入时间</AdminTableHead>
                      <AdminTableHead>单次上限</AdminTableHead>
                      <AdminTableHead>操作</AdminTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {whitelistItems.map((item, index) => {
                      const currentLimit =
                        limitDraft[item.user_id] ?? item.max_batch_create_count
                      const limitInvalid =
                        currentLimit <= 0 ||
                        currentLimit >
                          ENTERPRISE_CDK_HARD_MAX_BATCH_CREATE_COUNT
                      return (
                        <tr
                          key={item.user_id}
                          className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                        >
                          <AdminTableCell>
                            <div className='flex items-center gap-[10px]'>
                              <WhitelistAvatar
                                text={item.email || item.username || item.user_id}
                                index={index}
                              />
                              <div className='min-w-0'>
                                <div className='truncate text-[13.5px] leading-5 font-semibold text-[#0f172a] dark:text-foreground'>
                                  {item.email || item.username || '-'}
                                </div>
                                <div className='truncate text-[12px] leading-4 text-[#94a3b8] dark:text-muted-foreground/80'>
                                  {item.username && item.email
                                    ? item.username
                                    : '企业 CDK 用户'}
                                </div>
                              </div>
                            </div>
                          </AdminTableCell>
                          <AdminTableCell className='font-mono text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                            {item.user_id}
                          </AdminTableCell>
                          <AdminTableCell>
                            <strong
                              className={getWhitelistBalanceClass(
                                item.enterprise_cdk_quota
                              )}
                            >
                              {formatQuota(
                                item.enterprise_cdk_quota,
                                quotaPerUnit
                              )}
                            </strong>
                          </AdminTableCell>
                          <AdminTableCell className='text-[#64748b] dark:text-muted-foreground'>
                            {formatAdminDateOnly(item.created_time)}
                          </AdminTableCell>
                          <AdminTableCell>
                            <div className='flex items-center gap-2'>
                              <input
                                type='number'
                                min='1'
                                max={ENTERPRISE_CDK_HARD_MAX_BATCH_CREATE_COUNT}
                                className='h-[34px] w-[92px] rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                                value={currentLimit}
                                onChange={(event) =>
                                  setLimitDraft((current) => ({
                                    ...current,
                                    [item.user_id]: Number(event.target.value),
                                  }))
                                }
                              />
                              <AdminActionButton
                                disabled={limitInvalid}
                                onClick={() =>
                                  limitMutation.mutate({
                                    userId: item.user_id,
                                    max: currentLimit,
                                  })
                                }
                              >
                                保存上限
                              </AdminActionButton>
                            </div>
                          </AdminTableCell>
                          <AdminTableCell>
                            <div className='flex flex-wrap items-center gap-2'>
                              <AdminActionButton
                                onClick={() => showCustomerDetail(item.user_id)}
                              >
                                查看详情
                              </AdminActionButton>
                              <AdminActionButton
                                variant={
                                  item.enterprise_cdk_quota > 0
                                    ? 'secondary'
                                    : 'primary'
                                }
                                onClick={() => showBalanceAdjust(item.user_id)}
                              >
                                {item.enterprise_cdk_quota > 0
                                  ? '调整余额'
                                  : '充值'}
                              </AdminActionButton>
                              <AdminActionButton
                                variant='danger'
                                onClick={() =>
                                  whitelistMutation.mutate({
                                    action: 'remove',
                                    user_id: item.user_id,
                                  })
                                }
                              >
                                移除
                              </AdminActionButton>
                            </div>
                          </AdminTableCell>
                        </tr>
                      )
                    })}
                    {whitelistItems.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className='h-32 px-[14px] py-[11px] text-center text-[13.5px] text-[#64748b] dark:text-muted-foreground'
                        >
                          暂无白名单用户
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <p className='text-[12px] leading-4 text-[#64748b] dark:text-muted-foreground'>
                  单个用户单次创建数量上限范围为 1-
                  {ENTERPRISE_CDK_HARD_MAX_BATCH_CREATE_COUNT}。
                </p>
                <PaginationControls
                  page={whitelist.data?.data?.page ?? whitelistPage}
                  pageSize={whitelist.data?.data?.page_size}
                  total={whitelist.data?.data?.total}
                  onPageChange={setWhitelistPage}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value='balance'>
            <div className='space-y-4'>
              <div className='rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]'>
                <div className='mb-3 text-[15px] leading-5 font-semibold text-[#0f172a] dark:text-foreground'>
                  快速充值 / 扣减
                </div>
                <div className='flex flex-col gap-3'>
                  <input
                    type='text'
                    className='h-[34px] w-full max-w-[260px] rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                    placeholder='输入邮箱或用户 ID 搜索...'
                    value={balanceSearch}
                    onChange={(event) => setBalanceSearch(event.target.value)}
                  />
                  <BalanceSearchResults
                    users={balanceSearchResults}
                    selectedUserId={selectedBalanceUserId}
                    isSearching={balanceSearchQuery.isFetching}
                    quotaPerUnit={quotaPerUnit}
                    onSelect={(user) => showBalanceAdjust(user.id)}
                  />
                </div>
              </div>

              <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                <table className='w-full min-w-[980px] border-collapse'>
                  <thead>
                    <tr>
                      <AdminTableHead>用户</AdminTableHead>
                      <AdminTableHead>当前余额</AdminTableHead>
                      <AdminTableHead>历史充值总额</AdminTableHead>
                      <AdminTableHead>历史消耗总额</AdminTableHead>
                      <AdminTableHead>最后充值</AdminTableHead>
                      <AdminTableHead>操作</AdminTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {whitelistItems.map((item) => {
                      const actionLabel = formatEnterpriseCdkBalanceActionLabel(
                        item.enterprise_cdk_quota
                      )
                      return (
                        <tr
                          key={item.user_id}
                          className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                        >
                          <AdminTableCell>
                            <div className='font-semibold text-[#0f172a] dark:text-foreground'>
                              {item.email || item.username || '-'}
                            </div>
                            <div className='text-[12px] leading-4 text-[#94a3b8] dark:text-muted-foreground/80'>
                              ID: {item.user_id}
                            </div>
                          </AdminTableCell>
                          <AdminTableCell>
                            <strong
                              className={`text-[15px] leading-5 ${getWhitelistBalanceClass(
                                item.enterprise_cdk_quota
                              )}`}
                            >
                              {formatQuota(
                                item.enterprise_cdk_quota,
                                quotaPerUnit
                              )}
                            </strong>
                          </AdminTableCell>
                          <AdminTableCell className='text-[#64748b] dark:text-muted-foreground'>
                            {formatQuota(
                              item.total_charged_quota,
                              quotaPerUnit
                            )}
                          </AdminTableCell>
                          <AdminTableCell className='text-[#64748b] dark:text-muted-foreground'>
                            {formatQuota(
                              item.total_consumed_quota,
                              quotaPerUnit
                            )}
                          </AdminTableCell>
                          <AdminTableCell className='text-[#64748b] dark:text-muted-foreground'>
                            {formatAdminDateOnly(item.last_charged_time)}
                          </AdminTableCell>
                          <AdminTableCell>
                            <AdminActionButton
                              variant={
                                actionLabel === '充值'
                                  ? 'primary'
                                  : 'secondary'
                              }
                              onClick={() => showBalanceAdjust(item.user_id)}
                            >
                              {actionLabel}
                            </AdminActionButton>
                          </AdminTableCell>
                        </tr>
                      )
                    })}
                    {whitelistItems.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className='h-32 px-[14px] py-[11px] text-center text-[13.5px] text-[#64748b] dark:text-muted-foreground'
                        >
                          暂无余额用户
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className='flex justify-end'>
                <PaginationControls
                  page={whitelist.data?.data?.page ?? whitelistPage}
                  pageSize={whitelist.data?.data?.page_size}
                  total={whitelist.data?.data?.total}
                  onPageChange={setWhitelistPage}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value='logs'>
            <div className='space-y-4'>
              <div className='mb-[14px] flex flex-wrap items-center gap-2'>
                <input
                  type='text'
                  className={`${ADMIN_INPUT_CLASS} w-[200px]`}
                  placeholder='用户 ID'
                  value={balanceLogUserId}
                  onChange={(event) => {
                    setBalanceLogUserId(event.target.value)
                    setBalanceLogsPage(1)
                  }}
                />
                <AdminSelect
                  className='w-[160px]'
                  items={ENTERPRISE_CDK_QUOTA_LOG_TYPE_OPTIONS}
                  value={balanceLogType}
                  onValueChange={(value) => {
                    setBalanceLogType(value)
                    setBalanceLogsPage(1)
                  }}
                />
                <AdminButton
                  variant='secondary'
                  onClick={() => balanceLogs.refetch()}
                >
                  <RefreshCw className='size-[14px]' />
                  刷新
                </AdminButton>
                <span className='ml-auto text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                  共 {balanceLogs.data?.data?.total ?? 0} 条
                </span>
              </div>

              <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                <table className='w-full min-w-[1180px] border-collapse'>
                  <thead>
                    <tr>
                      <AdminTableHead>时间</AdminTableHead>
                      <AdminTableHead>用户</AdminTableHead>
                      <AdminTableHead>类型</AdminTableHead>
                      <AdminTableHead>变动</AdminTableHead>
                      <AdminTableHead>变动前</AdminTableHead>
                      <AdminTableHead>变动后</AdminTableHead>
                      <AdminTableHead>关联批次</AdminTableHead>
                      <AdminTableHead>CDK数</AdminTableHead>
                      <AdminTableHead>操作员</AdminTableHead>
                      <AdminTableHead>备注</AdminTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {(balanceLogs.data?.data?.items ?? []).map((item) => (
                      <tr
                        key={item.id}
                        className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                      >
                        <AdminTableCell className='text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                          {formatTime(item.created_time)}
                        </AdminTableCell>
                        <AdminTableCell>
                          <div className='text-[13px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                            {item.user_email || item.user_id}
                          </div>
                        </AdminTableCell>
                        <AdminTableCell>
                          <AdminBadge tone={getQuotaLogBadgeTone(item.type)}>
                            {formatEnterpriseCdkQuotaLogType(item.type)}
                          </AdminBadge>
                        </AdminTableCell>
                        <AdminTableCell
                          className={`font-bold ${getSignedQuotaClass(
                            item.amount
                          )}`}
                        >
                          {formatSignedQuota(item.amount, quotaPerUnit)}
                        </AdminTableCell>
                        <AdminTableCell className='text-[#64748b] dark:text-muted-foreground'>
                          {formatQuota(item.balance_before, quotaPerUnit)}
                        </AdminTableCell>
                        <AdminTableCell className='font-semibold'>
                          {formatQuota(item.balance_after, quotaPerUnit)}
                        </AdminTableCell>
                        <AdminTableCell className='text-[12.5px] text-[#2563eb] dark:text-blue-400'>
                          {item.batch_name || item.related_batch_id || '-'}
                        </AdminTableCell>
                        <AdminTableCell className='text-[#64748b] dark:text-muted-foreground'>
                          {item.related_cdk_count || '-'}
                        </AdminTableCell>
                        <AdminTableCell className='text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                          {item.operator_email ||
                            (item.operator_id ? item.operator_id : '系统')}
                        </AdminTableCell>
                        <AdminTableCell className='max-w-[260px] whitespace-normal text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                          {item.remark || '-'}
                        </AdminTableCell>
                      </tr>
                    ))}
                    {(balanceLogs.data?.data?.items ?? []).length === 0 && (
                      <AdminEmptyRow colSpan={10} />
                    )}
                  </tbody>
                </table>
              </div>
              <div className='flex justify-end'>
                <PaginationControls
                  page={balanceLogs.data?.data?.page ?? balanceLogsPage}
                  pageSize={balanceLogs.data?.data?.page_size}
                  total={balanceLogs.data?.data?.total}
                  onPageChange={setBalanceLogsPage}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value='batches'>
            <div className='space-y-4'>
              <div className='space-y-3'>
                <input
                  type='text'
                  className={`${ADMIN_INPUT_CLASS} w-[280px] max-w-full`}
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
              <div className='mb-[14px] flex flex-wrap items-center gap-2'>
                <input
                  type='text'
                  className={`${ADMIN_INPUT_CLASS} w-[160px]`}
                  placeholder='创建人用户 ID'
                  value={batchCreatorUserId}
                  onChange={(event) => {
                    setBatchCreatorUserId(event.target.value)
                    setBatchesPage(1)
                  }}
                />
                <AdminButton variant='secondary' onClick={() => batches.refetch()}>
                  <RefreshCw className='size-[14px]' />
                  刷新
                </AdminButton>
                <span className='ml-auto text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                  共 {batches.data?.data?.total ?? 0} 条
                </span>
              </div>

              <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                <table className='w-full min-w-[1080px] border-collapse'>
                  <thead>
                    <tr>
                      <AdminTableHead>批次 ID</AdminTableHead>
                      <AdminTableHead>批次名称</AdminTableHead>
                      <AdminTableHead>创建人</AdminTableHead>
                      <AdminTableHead>单个面额</AdminTableHead>
                      <AdminTableHead>数量</AdminTableHead>
                      <AdminTableHead>未兑换</AdminTableHead>
                      <AdminTableHead>已兑换</AdminTableHead>
                      <AdminTableHead>已过期</AdminTableHead>
                      <AdminTableHead>已禁用</AdminTableHead>
                      <AdminTableHead>总面额</AdminTableHead>
                      <AdminTableHead>创建时间</AdminTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {(batches.data?.data?.items ?? []).map((item) => (
                      <tr
                        key={item.id}
                        className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                      >
                        <AdminTableCell className='font-mono text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                          {item.id}
                        </AdminTableCell>
                        <AdminTableCell className='font-semibold'>
                          {item.name}
                        </AdminTableCell>
                        <AdminTableCell className='text-[12.5px]'>
                          {item.creator_email || item.creator_user_id}
                        </AdminTableCell>
                        <AdminTableCell>
                          {formatQuota(item.quota, quotaPerUnit)}
                        </AdminTableCell>
                        <AdminTableCell>{item.count}</AdminTableCell>
                        <AdminTableCell className='font-semibold text-[#d97706] dark:text-amber-400'>
                          {item.unused_count ?? item.stats?.unused_count ?? 0}
                        </AdminTableCell>
                        <AdminTableCell className='font-semibold text-[#16a34a] dark:text-emerald-400'>
                          {item.used_count ?? item.stats?.used_count ?? 0}
                        </AdminTableCell>
                        <AdminTableCell className='text-[#64748b] dark:text-muted-foreground'>
                          {item.expired_count ?? item.stats?.expired_count ?? 0}
                        </AdminTableCell>
                        <AdminTableCell className='text-[#dc2626] dark:text-red-400'>
                          {item.disabled_count ?? item.stats?.disabled_count ?? 0}
                        </AdminTableCell>
                        <AdminTableCell className='font-semibold'>
                          {formatQuota(item.total_quota, quotaPerUnit)}
                        </AdminTableCell>
                        <AdminTableCell className='text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                          {formatTime(item.created_time)}
                        </AdminTableCell>
                      </tr>
                    ))}
                    {(batches.data?.data?.items ?? []).length === 0 && (
                      <AdminEmptyRow colSpan={11} />
                    )}
                  </tbody>
                </table>
              </div>
              <div className='flex justify-end'>
                <PaginationControls
                  page={batches.data?.data?.page ?? batchesPage}
                  pageSize={batches.data?.data?.page_size}
                  total={batches.data?.data?.total}
                  onPageChange={setBatchesPage}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value='codes'>
            <div className='space-y-4'>
              <div className='space-y-3'>
                <input
                  type='text'
                  className={`${ADMIN_INPUT_CLASS} w-[280px] max-w-full`}
                  placeholder='搜索创建人邮箱或 ID'
                  value={codeCreatorSearch}
                  onChange={(event) => setCodeCreatorSearch(event.target.value)}
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

              <div className='mb-[14px] flex flex-wrap items-center gap-2'>
                <input
                  type='text'
                  className={`${ADMIN_INPUT_CLASS} w-[130px]`}
                  placeholder='用户 ID'
                  value={codeFilters.user_id}
                  onChange={(event) =>
                    updateCodeFilters({
                      user_id: event.target.value,
                    })
                  }
                />
                <input
                  type='text'
                  className={`${ADMIN_INPUT_CLASS} w-[130px]`}
                  placeholder='批次 ID'
                  value={codeFilters.batch_id}
                  onChange={(event) =>
                    updateCodeFilters({
                      batch_id: event.target.value,
                    })
                  }
                />
                <AdminSelect
                  className='w-[120px]'
                  items={ENTERPRISE_CDK_CODE_STATUS_OPTIONS}
                  value={codeFilters.status || 'all'}
                  onValueChange={(value) =>
                    updateCodeFilters({
                      status: value === 'all' ? '' : value,
                    })
                  }
                />
                <input
                  type='text'
                  className={`${ADMIN_INPUT_CLASS} w-[180px]`}
                  placeholder='CDK 码'
                  value={codeFilters.keyword}
                  onChange={(event) =>
                    updateCodeFilters({
                      keyword: event.target.value,
                    })
                  }
                />
                <input
                  aria-label='创建开始时间'
                  title='创建开始时间'
                  type='datetime-local'
                  className={`${ADMIN_INPUT_CLASS} w-[190px]`}
                  value={codeFilters.created_start}
                  onChange={(event) =>
                    updateCodeFilters({
                      created_start: event.target.value,
                    })
                  }
                />
                <input
                  aria-label='创建结束时间'
                  title='创建结束时间'
                  type='datetime-local'
                  className={`${ADMIN_INPUT_CLASS} w-[190px]`}
                  value={codeFilters.created_end}
                  onChange={(event) =>
                    updateCodeFilters({
                      created_end: event.target.value,
                    })
                  }
                />
                <div className='ml-auto flex items-center gap-2'>
                  <span className='text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                    共 {codes.data?.data?.total ?? 0} 条
                  </span>
                  <AdminButton
                    variant='secondary'
                    onClick={() => codes.refetch()}
                  >
                    <RefreshCw className='size-[14px]' />
                    刷新
                  </AdminButton>
                  <AdminButton
                    variant='secondary'
                    onClick={() =>
                      adminExportEnterpriseCdkCodes(exportCodeFilters())
                    }
                  >
                    <Download className='size-[14px]' />
                    导出 CSV
                  </AdminButton>
                  <AdminButton
                    variant='secondary'
                    disabled={selectedIds.length === 0}
                    onClick={() =>
                      adminExportEnterpriseCdkCodes({ cdk_ids: selectedIds })
                    }
                  >
                    <Download className='size-[14px]' />
                    导出选中
                  </AdminButton>
                </div>
              </div>

              <div className='flex flex-wrap items-end gap-2 rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]'>
                <textarea
                  className={`${ADMIN_INPUT_CLASS} min-h-[72px] w-[420px] max-w-full resize-y`}
                  placeholder='回收备注'
                  value={recycleRemark}
                  onChange={(event) => setRecycleRemark(event.target.value)}
                />
                <div className='min-w-48 text-[13px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                  已选 {selectedIds.length} 个，预计返还{' '}
                  <span className='font-semibold text-[#0f172a] dark:text-foreground'>
                    {formatQuota(selectedRefundQuota, quotaPerUnit)}
                  </span>
                </div>
                <AdminButton
                  variant='danger'
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
                  <RotateCcw className='size-[14px]' />
                  回收选中
                </AdminButton>
              </div>

              <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                <table className='w-full min-w-[1280px] border-collapse'>
                  <thead>
                    <tr>
                      <AdminTableHead>
                        <span className='sr-only'>选择</span>
                      </AdminTableHead>
                      <AdminTableHead>CDK 码</AdminTableHead>
                      <AdminTableHead>面额</AdminTableHead>
                      <AdminTableHead>批次</AdminTableHead>
                      <AdminTableHead>创建人</AdminTableHead>
                      <AdminTableHead>状态</AdminTableHead>
                      <AdminTableHead>过期时间</AdminTableHead>
                      <AdminTableHead>兑换时间</AdminTableHead>
                      <AdminTableHead>兑换用户</AdminTableHead>
                      <AdminTableHead>操作</AdminTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {codeItems.map((code) => {
                      const isRecycled = (code.recycled_time ?? 0) > 0
                      const actionDisabled =
                        isRecycled ||
                        disableMutation.isPending ||
                        (code.status !== CDK_STATUS.enabled &&
                          code.status !== CDK_STATUS.disabled)
                      return (
                        <tr
                          key={code.id}
                          className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                        >
                          <AdminTableCell>
                            <input
                              type='checkbox'
                              className='size-4 accent-[#0f172a] dark:accent-primary'
                              checked={selectedIds.includes(code.id)}
                              disabled={!isEnterpriseCdkCodeRecyclable(code)}
                              onChange={() => toggleSelected(code.id)}
                            />
                          </AdminTableCell>
                          <AdminTableCell className='font-mono text-[12.5px]'>
                            {code.key}
                          </AdminTableCell>
                          <AdminTableCell>
                            {formatQuota(code.quota, quotaPerUnit)}
                          </AdminTableCell>
                          <AdminTableCell className='text-[12.5px] text-[#2563eb] dark:text-blue-400'>
                            {code.batch_name || code.batch_id}
                          </AdminTableCell>
                          <AdminTableCell className='text-[12.5px]'>
                            {code.creator_email || code.user_id}
                          </AdminTableCell>
                          <AdminTableCell>
                            <AdminBadge tone={getCodeBadgeTone(code)}>
                              {getCodeStatus(code)}
                            </AdminBadge>
                          </AdminTableCell>
                          <AdminTableCell
                            className={
                              getCodeStatus(code) === '已过期'
                                ? 'text-[12.5px] text-[#dc2626] dark:text-red-400'
                                : 'text-[12.5px] text-[#64748b] dark:text-muted-foreground'
                            }
                          >
                            {formatTime(code.expired_time, '永不过期')}
                          </AdminTableCell>
                          <AdminTableCell className='text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                            {formatTime(code.redeemed_time)}
                          </AdminTableCell>
                          <AdminTableCell className='text-[12.5px]'>
                            {code.used_user_email || code.used_user_id || '-'}
                          </AdminTableCell>
                          <AdminTableCell>
                            <AdminActionButton
                              variant={
                                code.status === CDK_STATUS.disabled
                                  ? 'secondary'
                                  : 'danger'
                              }
                              disabled={actionDisabled}
                              onClick={() =>
                                disableMutation.mutate({
                                  id: code.id,
                                  disabled: code.status !== CDK_STATUS.disabled,
                                })
                              }
                            >
                              {isRecycled
                                ? '已回收'
                                : code.status === CDK_STATUS.disabled
                                  ? '启用'
                                  : '禁用'}
                            </AdminActionButton>
                          </AdminTableCell>
                        </tr>
                      )
                    })}
                    {codeItems.length === 0 && <AdminEmptyRow colSpan={10} />}
                  </tbody>
                </table>
              </div>
              <div className='flex justify-end'>
                <PaginationControls
                  page={codes.data?.data?.page ?? codesPage}
                  pageSize={codes.data?.data?.page_size}
                  total={codes.data?.data?.total}
                  onPageChange={(nextPage) => {
                    setCodesPage(nextPage)
                    setSelectedIds([])
                  }}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value='customer'>
            <div className='space-y-4'>
              <div className='rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]'>
                <div className='mb-3 text-[15px] leading-5 font-semibold text-[#0f172a] dark:text-foreground'>
                  企业客户详情
                </div>
                <div className='space-y-3'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <input
                      type='text'
                      className={`${ADMIN_INPUT_CLASS} w-[280px] max-w-full`}
                      placeholder='搜索用户邮箱或 ID'
                      value={customerSearch}
                      onChange={(event) =>
                        setCustomerSearch(event.target.value)
                      }
                    />
                    <AdminButton
                      variant='secondary'
                      disabled={!Number(customerSearch)}
                      onClick={() => selectCustomerUser(customerSearch)}
                    >
                      <Search className='size-[14px]' />
                      按 ID 查询
                    </AdminButton>
                  </div>
                  <UserSearchResults
                    users={customerSearchQuery.data?.data?.items ?? []}
                    quotaPerUnit={quotaPerUnit}
                    actionLabel='查看详情'
                    onSelect={(user) => selectCustomerUser(String(user.id))}
                  />
                  <div className='flex flex-wrap items-center gap-2 border-t border-[#e2e8f0] dark:border-border pt-4'>
                    <input
                      type='text'
                      className={`${ADMIN_INPUT_CLASS} w-[220px]`}
                      placeholder='用户 ID'
                      value={customerUserId}
                      onChange={(event) => selectCustomerUser(event.target.value)}
                    />
                    <AdminButton onClick={() => customerDetail.refetch()}>
                      <Search className='size-[14px]' />
                      查询
                    </AdminButton>
                  </div>
                </div>
              </div>

              {!customerData && (
                <div className='rounded-[12px] border border-dashed border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-5 py-12 text-center text-[13.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                  请输入用户 ID 或搜索企业用户查看详情
                </div>
              )}

              {customerData && (
                <>
                  <div className='rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]'>
                    <div className='mb-4 flex flex-wrap items-center gap-[14px]'>
                      <WhitelistAvatar
                        text={
                          customerData.user.email ||
                          customerData.user.username ||
                          customerData.user.id
                        }
                        index={0}
                        size='lg'
                      />
                      <div className='min-w-0 flex-1'>
                        <div className='truncate text-[16px] leading-6 font-bold text-[#0f172a] dark:text-foreground'>
                          {customerData.user.email ||
                            customerData.user.username ||
                            `用户 ${customerData.user.id}`}
                        </div>
                        <div className='truncate text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                          用户 ID: {customerData.user.id} ·{' '}
                          {customerData.user.username || '企业 CDK 用户'} ·
                          加入白名单：
                          {formatAdminDateOnly(
                            customerData.whitelist?.created_time
                          )}
                        </div>
                      </div>
                      <div className='ml-auto flex flex-wrap items-center gap-2'>
                        <AdminButton
                          variant='secondary'
                          onClick={() => showBalanceAdjust(customerData.user.id)}
                        >
                          调整余额
                        </AdminButton>
                        {customerData.whitelist && (
                          <AdminButton
                            variant='danger'
                            onClick={() =>
                              whitelistMutation.mutate({
                                action: 'remove',
                                user_id: customerData.user.id,
                              })
                            }
                          >
                            移出白名单
                          </AdminButton>
                        )}
                      </div>
                    </div>

                    <div className='grid gap-3 md:grid-cols-4'>
                      <AdminStatCard
                        label='当前余额'
                        value={formatQuota(
                          customerData.user.enterprise_cdk_quota,
                          quotaPerUnit
                        )}
                        tone='success'
                      />
                      <AdminStatCard
                        label='历史充值总额'
                        value={formatQuota(
                          customerData.quota_summary.total_charged_quota,
                          quotaPerUnit
                        )}
                      />
                      <AdminStatCard
                        label='历史消耗总额'
                        value={formatQuota(
                          customerData.quota_summary.total_consumed_quota,
                          quotaPerUnit
                        )}
                      />
                      <AdminStatCard
                        label='CDK 总量 / 已兑换'
                        value={`${customerData.customer_summary.total_cdks} / ${customerData.customer_summary.redeemed_cdks}`}
                      />
                    </div>
                  </div>

                  <div className='mb-5 flex gap-0 border-b border-[#e2e8f0] dark:border-border'>
                    {[
                      ['logs', '余额流水'],
                      ['batches', '批次记录'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type='button'
                        className={`mb-[-1px] cursor-pointer border-b-2 px-4 py-[10px] text-[13.5px] leading-5 transition-colors ${
                          customerSubTab === value
                            ? 'border-[#0f172a] dark:border-primary font-semibold text-[#0f172a] dark:text-foreground'
                            : 'border-transparent font-medium text-[#64748b] dark:text-muted-foreground hover:text-[#0f172a] dark:hover:text-foreground'
                        }`}
                        onClick={() => setCustomerSubTab(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {customerSubTab === 'logs' && (
                    <div className='space-y-3'>
                      <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                        <table className='w-full min-w-[980px] border-collapse'>
                          <thead>
                            <tr>
                              <AdminTableHead>时间</AdminTableHead>
                              <AdminTableHead>类型</AdminTableHead>
                              <AdminTableHead>变动</AdminTableHead>
                              <AdminTableHead>变动前</AdminTableHead>
                              <AdminTableHead>变动后</AdminTableHead>
                              <AdminTableHead>关联批次</AdminTableHead>
                              <AdminTableHead>操作员</AdminTableHead>
                              <AdminTableHead>备注</AdminTableHead>
                            </tr>
                          </thead>
                          <tbody>
                            {customerLogs.map((item) => (
                              <tr
                                key={item.id}
                                className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                              >
                                <AdminTableCell className='text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                                  {formatTime(item.created_time)}
                                </AdminTableCell>
                                <AdminTableCell>
                                  <AdminBadge tone={getQuotaLogBadgeTone(item.type)}>
                                    {formatEnterpriseCdkQuotaLogType(item.type)}
                                  </AdminBadge>
                                </AdminTableCell>
                                <AdminTableCell
                                  className={`font-bold ${getSignedQuotaClass(
                                    item.amount
                                  )}`}
                                >
                                  {formatSignedQuota(item.amount, quotaPerUnit)}
                                </AdminTableCell>
                                <AdminTableCell className='text-[#64748b] dark:text-muted-foreground'>
                                  {formatQuota(item.balance_before, quotaPerUnit)}
                                </AdminTableCell>
                                <AdminTableCell className='font-semibold'>
                                  {formatQuota(item.balance_after, quotaPerUnit)}
                                </AdminTableCell>
                                <AdminTableCell className='text-[12.5px] text-[#2563eb] dark:text-blue-400'>
                                  {item.batch_name ||
                                    item.related_batch_id ||
                                    '-'}
                                </AdminTableCell>
                                <AdminTableCell className='text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                                  {item.operator_email ||
                                    (item.operator_id ? item.operator_id : '系统')}
                                </AdminTableCell>
                                <AdminTableCell className='max-w-[260px] whitespace-normal text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                                  {item.remark || '-'}
                                </AdminTableCell>
                              </tr>
                            ))}
                            {customerLogs.length === 0 && (
                              <AdminEmptyRow colSpan={8} />
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className='flex justify-end'>
                        <PaginationControls
                          page={
                            customerData.logs_page?.page ?? customerLogsPage
                          }
                          pageSize={customerData.logs_page?.page_size}
                          total={customerData.logs_page?.total}
                          onPageChange={setCustomerLogsPage}
                        />
                      </div>
                    </div>
                  )}

                  {customerSubTab === 'batches' && (
                    <div className='space-y-3'>
                      <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                        <table className='w-full min-w-[980px] border-collapse'>
                          <thead>
                            <tr>
                              <AdminTableHead>批次名称</AdminTableHead>
                              <AdminTableHead>面额</AdminTableHead>
                              <AdminTableHead>数量</AdminTableHead>
                              <AdminTableHead>总面额</AdminTableHead>
                              <AdminTableHead>未兑换</AdminTableHead>
                              <AdminTableHead>已兑换</AdminTableHead>
                              <AdminTableHead>创建时间</AdminTableHead>
                            </tr>
                          </thead>
                          <tbody>
                            {customerBatches.map((item) => (
                              <tr
                                key={item.id}
                                className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                              >
                                <AdminTableCell className='font-semibold'>
                                  {item.name}
                                </AdminTableCell>
                                <AdminTableCell>
                                  {formatQuota(item.quota, quotaPerUnit)}
                                </AdminTableCell>
                                <AdminTableCell>{item.count}</AdminTableCell>
                                <AdminTableCell className='font-semibold'>
                                  {formatQuota(item.total_quota, quotaPerUnit)}
                                </AdminTableCell>
                                <AdminTableCell className='font-semibold text-[#d97706] dark:text-amber-400'>
                                  {item.unused_count ??
                                    item.stats?.unused_count ??
                                    0}
                                </AdminTableCell>
                                <AdminTableCell className='font-semibold text-[#16a34a] dark:text-emerald-400'>
                                  {item.used_count ?? item.stats?.used_count ?? 0}
                                </AdminTableCell>
                                <AdminTableCell className='text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                                  {formatTime(item.created_time)}
                                </AdminTableCell>
                              </tr>
                            ))}
                            {customerBatches.length === 0 && (
                              <AdminEmptyRow colSpan={7} />
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className='flex justify-end'>
                        <PaginationControls
                          page={
                            customerData.batches_page?.page ??
                            customerBatchesPage
                          }
                          pageSize={customerData.batches_page?.page_size}
                          total={customerData.batches_page?.total}
                          onPageChange={setCustomerBatchesPage}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value='operations'>
            <div className='space-y-4'>
              <div className='mb-[14px] flex flex-wrap items-center gap-2'>
                <AdminButton
                  variant='secondary'
                  onClick={() => operationLogs.refetch()}
                >
                  <RefreshCw className='size-[14px]' />
                  刷新
                </AdminButton>
                <span className='ml-auto text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                  共 {operationLogs.data?.data?.total ?? 0} 条
                </span>
              </div>
              <div className='overflow-x-auto rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card'>
                <table className='w-full min-w-[1080px] border-collapse'>
                  <thead>
                    <tr>
                      <AdminTableHead>时间</AdminTableHead>
                      <AdminTableHead>操作</AdminTableHead>
                      <AdminTableHead>管理员</AdminTableHead>
                      <AdminTableHead>目标用户</AdminTableHead>
                      <AdminTableHead>批次</AdminTableHead>
                      <AdminTableHead>数量</AdminTableHead>
                      <AdminTableHead>备注</AdminTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {(operationLogs.data?.data?.items ?? []).map((item) => (
                      <tr
                        key={item.id}
                        className='last:[&>td]:border-b-0 hover:[&>td]:bg-[#f8fafc] dark:hover:[&>td]:bg-muted/40'
                      >
                        <AdminTableCell className='text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                          {formatTime(item.created_time)}
                        </AdminTableCell>
                        <AdminTableCell>
                          <AdminBadge tone={getOperationBadgeTone(item.action)}>
                            {formatEnterpriseCdkOperationAction(item.action)}
                          </AdminBadge>
                        </AdminTableCell>
                        <AdminTableCell className='text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                          {item.operator_email || item.operator_id}
                        </AdminTableCell>
                        <AdminTableCell className='text-[12.5px]'>
                          {item.target_user_email || item.target_user_id || '-'}
                        </AdminTableCell>
                        <AdminTableCell className='text-[12.5px] text-[#2563eb] dark:text-blue-400'>
                          {item.batch_name || item.batch_id || '-'}
                        </AdminTableCell>
                        <AdminTableCell className='font-semibold'>
                          {item.cdk_count || '-'}
                        </AdminTableCell>
                        <AdminTableCell className='max-w-[320px] whitespace-normal text-[12.5px] text-[#64748b] dark:text-muted-foreground'>
                          {item.remark || item.request_summary || '-'}
                        </AdminTableCell>
                      </tr>
                    ))}
                    {(operationLogs.data?.data?.items ?? []).length === 0 && (
                      <AdminEmptyRow colSpan={7} />
                    )}
                  </tbody>
                </table>
              </div>
              <div className='flex justify-end'>
                <PaginationControls
                  page={operationLogs.data?.data?.page ?? operationLogsPage}
                  pageSize={operationLogs.data?.data?.page_size}
                  total={operationLogs.data?.data?.total}
                  onPageChange={setOperationLogsPage}
                />
              </div>
            </div>
          </TabsContent>
          </Tabs>
        </div>
      </Main>

      <Dialog open={whitelistAddOpen} onOpenChange={handleWhitelistAddOpenChange}>
        <DialogContent
          showCloseButton={false}
          overlayClassName='bg-black/45 supports-backdrop-filter:backdrop-blur-[2px]'
          className='max-h-[90vh] gap-0 overflow-hidden rounded-[12px] bg-white dark:bg-card p-0 text-[#0f172a] dark:text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.12)] ring-0 sm:max-w-[440px]'
          style={{
            fontFamily:
              '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div className='flex items-center justify-between border-b border-[#e2e8f0] dark:border-border px-6 pt-5 pb-4'>
            <DialogTitle className='text-[15px] leading-5 font-bold text-[#0f172a] dark:text-foreground'>
              添加企业用户
            </DialogTitle>
            <button
              type='button'
              aria-label='关闭添加企业用户弹窗'
              className='inline-flex size-7 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent text-[#64748b] dark:text-muted-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted hover:text-[#0f172a] dark:hover:text-foreground'
              onClick={() => handleWhitelistAddOpenChange(false)}
            >
              <X className='size-[17px]' />
            </button>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (addWhitelistDisabled) return
              addWhitelistMutation.mutate()
            }}
          >
            <div className='space-y-[14px] px-6 py-5'>
              <div className='flex flex-col gap-[5px]'>
                <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                  搜索用户（邮箱或用户 ID）
                  <span className='ml-0.5 text-[#dc2626] dark:text-red-400'>*</span>
                </label>
                <input
                  type='text'
                  className='h-[34px] w-full rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                  placeholder='输入邮箱或 ID 搜索'
                  value={whitelistAddSearch}
                  onChange={(event) => {
                    setWhitelistAddSearch(event.target.value)
                    setSelectedWhitelistUser(null)
                  }}
                />
              </div>

              <WhitelistSearchResults
                users={whitelistSearchQuery.data?.data?.items ?? []}
                selectedUserId={selectedWhitelistUser?.id}
                isSearching={whitelistSearchQuery.isFetching}
                quotaPerUnit={quotaPerUnit}
                onSelect={setSelectedWhitelistUser}
              />

              <div className='flex flex-col gap-[5px]'>
                <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                  初始 CDK 余额 (USD)
                </label>
                <div className='relative'>
                  <span className='pointer-events-none absolute top-1/2 left-[10px] -translate-y-1/2 text-[13px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                    $
                  </span>
                  <input
                    type='number'
                    min='0'
                    step='0.01'
                    className='h-[34px] w-full rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 py-[7px] pr-[10px] pl-[22px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                    placeholder='0'
                    value={whitelistInitialBalance}
                    onChange={(event) =>
                      setWhitelistInitialBalance(event.target.value)
                    }
                  />
                </div>
                <span
                  className={`text-[12px] leading-4 ${
                    whitelistInitialBalanceInvalid
                      ? 'text-[#dc2626] dark:text-red-400'
                      : 'text-[#94a3b8] dark:text-muted-foreground/80'
                  }`}
                >
                  {whitelistInitialBalanceInvalid
                    ? '初始余额必须大于 0'
                    : '可选：添加时同时充值初始额度'}
                </span>
              </div>

              <div className='flex flex-col gap-[5px]'>
                <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                  备注
                </label>
                <input
                  type='text'
                  className='h-[34px] w-full rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                  placeholder='例：ACME 公司负责人，微信收款 ¥1000'
                  value={whitelistRemark}
                  onChange={(event) => setWhitelistRemark(event.target.value)}
                />
              </div>
            </div>

            <div className='flex items-center justify-end gap-2 rounded-b-[12px] border-t border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-6 py-[14px]'>
              <button
                type='button'
                className='inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[14px] text-[13.5px] leading-5 font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted'
                onClick={() => handleWhitelistAddOpenChange(false)}
              >
                取消
              </button>
              <button
                type='submit'
                disabled={addWhitelistDisabled}
                className='inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[8px] border border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary px-[14px] text-[13.5px] leading-5 font-medium whitespace-nowrap text-white dark:text-primary-foreground transition-colors hover:bg-[#1e293b] dark:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-[.45]'
              >
                {addWhitelistMutation.isPending ? '处理中...' : '加入白名单'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={balanceAdjustOpen}
        onOpenChange={handleBalanceAdjustOpenChange}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName='bg-black/45 supports-backdrop-filter:backdrop-blur-[2px]'
          className='max-h-[90vh] gap-0 overflow-hidden rounded-[12px] bg-white dark:bg-card p-0 text-[#0f172a] dark:text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.12)] ring-0 sm:max-w-[440px]'
          style={{
            fontFamily:
              '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div className='flex items-center justify-between border-b border-[#e2e8f0] dark:border-border px-6 pt-5 pb-4'>
            <div>
              <DialogTitle className='text-[15px] leading-5 font-bold text-[#0f172a] dark:text-foreground'>
                调整 CDK 余额
              </DialogTitle>
              <div className='mt-0.5 text-[12.5px] leading-4 text-[#64748b] dark:text-muted-foreground'>
                {selectedBalanceUserName || `用户 ${selectedBalanceUserId}`} ·
                当前余额 {formatQuota(selectedBalanceUserQuota, quotaPerUnit)}
              </div>
            </div>
            <button
              type='button'
              aria-label='关闭调整 CDK 余额弹窗'
              className='inline-flex size-7 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent text-[#64748b] dark:text-muted-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted hover:text-[#0f172a] dark:hover:text-foreground'
              onClick={() => handleBalanceAdjustOpenChange(false)}
            >
              <X className='size-[17px]' />
            </button>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (balanceSubmitDisabled) return
              balanceMutation.mutate({
                user_id: Number(balanceForm.user_id),
                amount: balanceForm.amount,
                type: balanceForm.type,
                remark: balanceForm.remark,
              })
            }}
          >
            <div className='space-y-[14px] px-6 py-5'>
              <div className='flex flex-col gap-[5px]'>
                <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                  操作类型<span className='ml-0.5 text-[#dc2626] dark:text-red-400'>*</span>
                </label>
                <Select
                  items={ENTERPRISE_CDK_BALANCE_ADJUST_TYPES}
                  value={balanceForm.type}
                  onValueChange={(value) => {
                    if (!value) return
                    setBalanceForm((current) => ({
                      ...current,
                      type: value,
                    }))
                  }}
                >
                  <SelectTrigger className='h-[34px] w-full rounded-[8px] border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground shadow-none transition-[border-color,box-shadow] focus-visible:border-[#94a3b8] dark:focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-[#94a3b8]/20 dark:focus-visible:ring-ring/40'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align='start'
                    alignItemWithTrigger={false}
                    className='min-w-[180px] rounded-[10px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card p-1 text-[#0f172a] dark:text-foreground shadow-[0_12px_28px_rgba(15,23,42,0.14)] ring-0'
                  >
                    <SelectGroup className='p-0'>
                      {ENTERPRISE_CDK_BALANCE_ADJUST_TYPES.map((type) => (
                        <SelectItem
                          key={type.value}
                          value={type.value}
                          className='h-8 rounded-[7px] px-2 py-0 text-[13.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground focus:bg-[#f1f5f9] dark:focus:bg-muted focus:text-[#0f172a] dark:focus:text-foreground'
                        >
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className='flex flex-col gap-[5px]'>
                <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                  调整金额 (USD)
                  <span className='ml-0.5 text-[#dc2626] dark:text-red-400'>*</span>
                </label>
                <div className='relative'>
                  <span className='pointer-events-none absolute top-1/2 left-[10px] -translate-y-1/2 text-[13px] leading-5 text-[#64748b] dark:text-muted-foreground'>
                    $
                  </span>
                  <input
                    type='number'
                    min='0.01'
                    step='0.01'
                    className='h-[34px] w-full rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 py-[7px] pr-[10px] pl-[22px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                    placeholder='0.00'
                    value={balanceForm.amount}
                    onChange={(event) =>
                      setBalanceForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className='flex flex-col gap-[5px]'>
                <label className='text-[12.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground'>
                  备注<span className='ml-0.5 text-[#dc2626] dark:text-red-400'>*</span>
                </label>
                <input
                  type='text'
                  className='h-[34px] w-full rounded-[8px] border border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-[#94a3b8] dark:placeholder:text-muted-foreground/70 focus:border-[#94a3b8] dark:focus:border-ring focus:ring-[3px] focus:ring-[#94a3b8]/20 dark:focus:ring-ring/40'
                  placeholder='例：微信收款 ¥1000，2026-07-03'
                  value={balanceForm.remark}
                  onChange={(event) =>
                    setBalanceForm((current) => ({
                      ...current,
                      remark: event.target.value,
                    }))
                  }
                />
                <span className='text-[12px] leading-4 text-[#94a3b8] dark:text-muted-foreground/80'>
                  必填。请记录收款金额、日期等信息，便于对账
                </span>
              </div>

              <div className='mt-[14px] rounded-[8px] border border-[#e2e8f0] dark:border-border bg-[#f1f5f9] dark:bg-muted px-[14px] py-3'>
                <div className='flex items-center justify-between py-[3px] text-[13px] leading-5'>
                  <span className='text-[#64748b] dark:text-muted-foreground'>调整前余额</span>
                  <span className='font-semibold text-[#0f172a] dark:text-foreground'>
                    {formatQuota(selectedBalanceUserQuota, quotaPerUnit)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-[3px] text-[13px] leading-5'>
                  <span className='font-semibold text-[#64748b] dark:text-muted-foreground'>
                    调整后余额
                  </span>
                  <span className='text-[15px] leading-5 font-semibold text-[#0f172a] dark:text-foreground'>
                    {formatQuota(selectedBalanceAdjustedQuota, quotaPerUnit)}
                  </span>
                </div>
              </div>
            </div>

            <div className='flex items-center justify-end gap-2 rounded-b-[12px] border-t border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-6 py-[14px]'>
              <button
                type='button'
                className='inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[14px] text-[13.5px] leading-5 font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted'
                onClick={() => handleBalanceAdjustOpenChange(false)}
              >
                取消
              </button>
              <button
                type='submit'
                disabled={balanceSubmitDisabled}
                className='inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[8px] border border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary px-[14px] text-[13.5px] leading-5 font-medium whitespace-nowrap text-white dark:text-primary-foreground transition-colors hover:bg-[#1e293b] dark:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-[.45]'
              >
                {balanceMutation.isPending ? '处理中...' : '确认调整'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
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
    <div className='max-w-2xl overflow-hidden rounded-[8px] border border-[#e2e8f0] dark:border-border'>
      {users.map((user) => (
        <div
          key={user.id}
          className='flex flex-wrap items-center gap-[10px] border-b border-[#e2e8f0] dark:border-border bg-white dark:bg-card px-[14px] py-[10px] last:border-b-0'
        >
          <div className='min-w-0 flex-1'>
            <div className='truncate text-[13.5px] leading-5 font-semibold text-[#0f172a] dark:text-foreground'>
              {getEnterpriseCdkUserDisplayName(user)}
            </div>
            <div className='truncate text-[12px] leading-4 text-[#64748b] dark:text-muted-foreground'>
              ID: {user.id} · 当前 CDK 余额{' '}
              {formatQuota(user.enterprise_cdk_quota ?? 0, quotaPerUnit)}
            </div>
          </div>
          <button
            type='button'
            className='inline-flex h-[28px] cursor-pointer items-center justify-center rounded-[8px] border border-[#cbd5e1] dark:border-input bg-transparent px-[10px] text-[12.5px] leading-4 font-medium whitespace-nowrap text-[#0f172a] dark:text-foreground transition-colors hover:bg-[#f1f5f9] dark:hover:bg-muted'
            onClick={() => onSelect(user)}
          >
            {actionLabel}
          </button>
        </div>
      ))}
    </div>
  )
}

function BalanceSearchResults({
  users,
  selectedUserId,
  isSearching,
  quotaPerUnit,
  onSelect,
}: {
  users: EnterpriseCdkUserSearchResult[]
  selectedUserId: number
  isSearching: boolean
  quotaPerUnit?: number
  onSelect: (user: EnterpriseCdkUserSearchResult) => void
}) {
  if (isSearching) {
    return (
      <div className='rounded-[8px] border border-[#e2e8f0] dark:border-border px-[14px] py-[10px] text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
        正在搜索...
      </div>
    )
  }

  if (users.length === 0) {
    return null
  }

  return (
    <div className='space-y-2'>
      {users.map((user) => {
        const selected = user.id === selectedUserId
        return (
          <div
            key={user.id}
            className={`flex flex-wrap items-center gap-[10px] rounded-[8px] border px-[14px] py-2 ${
              selected
                ? 'border-[#bfdbfe] dark:border-primary/30 bg-[#eff6ff] dark:bg-primary/10'
                : 'border-[#e2e8f0] dark:border-border bg-white dark:bg-card'
            }`}
          >
            <div className='min-w-0 flex-1'>
              <div className='truncate text-[13.5px] leading-5 font-semibold text-[#0f172a] dark:text-foreground'>
                {getEnterpriseCdkUserDisplayName(user)}
              </div>
              <div className='truncate text-[12px] leading-4 text-[#64748b] dark:text-muted-foreground'>
                ID: {user.id} · 当前余额{' '}
                {formatQuota(user.enterprise_cdk_quota ?? 0, quotaPerUnit)}
              </div>
            </div>
            <button
              type='button'
              className='ml-auto inline-flex h-[28px] cursor-pointer items-center justify-center rounded-[8px] border border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary px-[10px] text-[12.5px] leading-4 font-medium whitespace-nowrap text-white dark:text-primary-foreground transition-colors hover:bg-[#1e293b] dark:hover:bg-primary/90'
              onClick={() => onSelect(user)}
            >
              {selected ? '已选择' : '调整余额'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function AdminTableHead({ children }: { children: ReactNode }) {
  return (
    <th className='border-b border-[#e2e8f0] dark:border-border bg-[#fafafa] dark:bg-background px-[14px] py-[10px] text-left text-[12px] leading-4 font-semibold whitespace-nowrap text-[#64748b] dark:text-muted-foreground'>
      {children}
    </th>
  )
}

function AdminTableCell({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <td
      className={`border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] align-middle text-[13.5px] leading-5 whitespace-nowrap text-[#0f172a] dark:text-foreground ${className}`}
    >
      {children}
    </td>
  )
}

function AdminActionButton({
  children,
  variant = 'secondary',
  disabled,
  onClick,
}: {
  children: ReactNode
  variant?: 'secondary' | 'primary' | 'danger'
  disabled?: boolean
  onClick?: () => void
}) {
  const className =
    variant === 'primary'
      ? 'border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary text-white dark:text-primary-foreground hover:bg-[#1e293b] dark:hover:bg-primary/90'
      : variant === 'danger'
        ? 'border-[#dc2626] dark:border-destructive bg-[#dc2626] dark:bg-destructive text-white hover:bg-[#b91c1c] dark:hover:bg-destructive/90'
        : 'border-[#cbd5e1] dark:border-input bg-transparent text-[#0f172a] dark:text-foreground hover:bg-[#f1f5f9] dark:hover:bg-muted'

  return (
    <button
      type='button'
      disabled={disabled}
      className={`inline-flex h-6 cursor-pointer items-center justify-center rounded-[8px] border px-2 text-[12px] leading-4 font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-[.45] ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function AdminButton({
  children,
  variant = 'primary',
  disabled,
  onClick,
}: {
  children: ReactNode
  variant?: 'secondary' | 'primary' | 'danger'
  disabled?: boolean
  onClick?: () => void
}) {
  const className =
    variant === 'primary'
      ? 'border-[#0f172a] dark:border-primary bg-[#0f172a] dark:bg-primary text-white dark:text-primary-foreground hover:bg-[#1e293b] dark:hover:bg-primary/90'
      : variant === 'danger'
        ? 'border-[#dc2626] dark:border-destructive bg-[#dc2626] dark:bg-destructive text-white hover:bg-[#b91c1c] dark:hover:bg-destructive/90'
        : 'border-[#cbd5e1] dark:border-input bg-transparent text-[#0f172a] dark:text-foreground hover:bg-[#f1f5f9] dark:hover:bg-muted'

  return (
    <button
      type='button'
      disabled={disabled}
      className={`inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border px-[14px] text-[13.5px] leading-5 font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-[.45] ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function AdminSelect({
  items,
  value,
  className = '',
  onValueChange,
}: {
  items: ReadonlyArray<{ value: string; label: string }>
  value: string
  className?: string
  onValueChange: (value: string) => void
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(nextValue) => {
        if (!nextValue) return
        onValueChange(String(nextValue))
      }}
    >
      <SelectTrigger
        className={`h-[34px] rounded-[8px] border-[#cbd5e1] dark:border-input bg-white dark:bg-input/30 px-[10px] py-[7px] text-[13.5px] leading-5 text-[#0f172a] dark:text-foreground shadow-none transition-[border-color,box-shadow] focus-visible:border-[#94a3b8] dark:focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-[#94a3b8]/20 dark:focus-visible:ring-ring/40 ${className}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align='start'
        alignItemWithTrigger={false}
        className='min-w-[160px] rounded-[10px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card p-1 text-[#0f172a] dark:text-foreground shadow-[0_12px_28px_rgba(15,23,42,0.14)] ring-0'
      >
        <SelectGroup className='p-0'>
          {items.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              className='h-8 rounded-[7px] px-2 py-0 text-[13.5px] leading-5 font-medium text-[#0f172a] dark:text-foreground focus:bg-[#f1f5f9] dark:focus:bg-muted focus:text-[#0f172a] dark:focus:text-foreground'
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function AdminBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
}) {
  const className =
    tone === 'success'
      ? 'border-[#bbf7d0] dark:border-emerald-500/30 bg-[#f0fdf4] dark:bg-emerald-500/10 text-[#16a34a] dark:text-emerald-400'
      : tone === 'warning'
        ? 'border-[#fde68a] dark:border-amber-500/30 bg-[#fffbeb] dark:bg-amber-500/10 text-[#d97706] dark:text-amber-400'
        : tone === 'danger'
          ? 'border-[#fecaca] dark:border-red-500/30 bg-[#fef2f2] dark:bg-red-500/10 text-[#dc2626] dark:text-red-400'
          : tone === 'info'
            ? 'border-[#bfdbfe] dark:border-primary/30 bg-[#eff6ff] dark:bg-primary/10 text-[#2563eb] dark:text-blue-400'
            : 'border-[#e2e8f0] dark:border-border bg-[#f1f5f9] dark:bg-muted text-[#64748b] dark:text-muted-foreground'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] leading-4 font-medium ${className}`}
    >
      {children}
    </span>
  )
}

function AdminEmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className='h-32 border-b border-[#e2e8f0] dark:border-border px-[14px] py-[11px] text-center text-[13.5px] leading-5 text-[#64748b] dark:text-muted-foreground'
      >
        暂无数据
      </td>
    </tr>
  )
}

function AdminStatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success' | 'warning' | 'danger'
}) {
  const valueClass =
    tone === 'success'
      ? 'text-[#16a34a] dark:text-emerald-400'
      : tone === 'warning'
        ? 'text-[#d97706] dark:text-amber-400'
        : tone === 'danger'
          ? 'text-[#dc2626] dark:text-red-400'
          : 'text-[#0f172a] dark:text-foreground'

  return (
    <div className='rounded-[12px] border border-[#e2e8f0] dark:border-border bg-white dark:bg-card px-[18px] py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]'>
      <div className='mb-1 text-[12px] leading-4 font-medium text-[#64748b] dark:text-muted-foreground'>
        {label}
      </div>
      <div className={`text-[20px] leading-7 font-bold ${valueClass}`}>
        {value}
      </div>
    </div>
  )
}

function WhitelistAvatar({
  text,
  index,
  size = 'sm',
}: {
  text: string | number
  index: number
  size?: 'sm' | 'lg'
}) {
  const palettes = [
    'bg-[#dbeafe] text-[#1d4ed8] dark:bg-blue-500/15 dark:text-blue-300',
    'bg-[#fce7f3] text-[#be185d] dark:bg-pink-500/15 dark:text-pink-300',
    'bg-[#d1fae5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300',
    'bg-[#fef3c7] text-[#b45309] dark:bg-amber-500/15 dark:text-amber-300',
  ]
  const label = String(text || '?').trim().slice(0, 1).toUpperCase() || '?'

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full leading-none font-bold ${
        size === 'lg'
          ? 'size-11 text-[16px]'
          : 'size-[30px] text-[11px]'
      } ${palettes[index % palettes.length]}`}
    >
      {label}
    </div>
  )
}

function WhitelistSearchResults({
  users,
  selectedUserId,
  isSearching,
  quotaPerUnit,
  onSelect,
}: {
  users: EnterpriseCdkUserSearchResult[]
  selectedUserId?: number
  isSearching: boolean
  quotaPerUnit?: number
  onSelect: (user: EnterpriseCdkUserSearchResult) => void
}) {
  if (isSearching) {
    return (
      <div className='rounded-[8px] border border-[#e2e8f0] dark:border-border px-[14px] py-[10px] text-[12.5px] leading-5 text-[#64748b] dark:text-muted-foreground'>
        正在搜索...
      </div>
    )
  }

  if (users.length === 0) {
    return null
  }

  return (
    <div className='overflow-hidden rounded-[8px] border border-[#e2e8f0] dark:border-border'>
      {users.map((user, index) => {
        const selected = user.id === selectedUserId
        return (
          <div
            key={user.id}
            className={`flex items-center gap-[10px] border-b border-[#e2e8f0] dark:border-border px-[14px] py-[10px] last:border-b-0 ${
              selected ? 'bg-[#eff6ff] dark:bg-primary/10' : 'bg-white dark:bg-card'
            }`}
          >
            <div className='flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2563eb] dark:bg-primary text-[12px] leading-none font-bold text-white dark:text-primary-foreground'>
              {getEnterpriseCdkUserDisplayName(user).slice(0, 1).toUpperCase()}
            </div>
            <div className='min-w-0 flex-1'>
              <div className='truncate text-[13.5px] leading-5 font-semibold text-[#0f172a] dark:text-foreground'>
                {getEnterpriseCdkUserDisplayName(user)}
              </div>
              <div className='truncate text-[12px] leading-4 text-[#64748b] dark:text-muted-foreground'>
                用户 ID: {user.id}
                {user.created_at
                  ? ` · 注册于 ${formatAdminDateOnly(user.created_at)}`
                  : ` · 当前 CDK 余额 ${formatQuota(
                      user.enterprise_cdk_quota ?? 0,
                      quotaPerUnit
                    )}`}
              </div>
            </div>
            <button
              type='button'
              className={`inline-flex h-[28px] cursor-pointer items-center justify-center rounded-[8px] border px-[10px] text-[12.5px] leading-4 font-medium whitespace-nowrap transition-colors ${
                selected
                  ? 'border-[#16a34a] bg-[#16a34a] dark:bg-emerald-500 text-white'
                  : 'border-[#16a34a] bg-[#16a34a] dark:bg-emerald-500 text-white hover:bg-[#15803d] dark:hover:bg-emerald-600'
              }`}
              onClick={() => onSelect(user)}
            >
              {selected ? '已选择' : index === 0 ? '选择' : '选择'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function getEnterpriseCdkUserDisplayName(user: EnterpriseCdkUserSearchResult) {
  return user.email || user.display_name || user.username || String(user.id)
}

function formatAdminDateOnly(timestamp?: number) {
  if (!timestamp) return '-'
  const date = new Date(timestamp * 1000)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWhitelistBalanceClass(quota: number) {
  if (quota <= 0) return 'text-[#dc2626] dark:text-red-400'
  if (quota <= 20000) return 'text-[#d97706] dark:text-amber-400'
  return 'text-[#16a34a] dark:text-emerald-400'
}

function getSignedQuotaClass(amount?: number) {
  if ((amount ?? 0) > 0) return 'text-[#16a34a] dark:text-emerald-400'
  if ((amount ?? 0) < 0) return 'text-[#dc2626] dark:text-red-400'
  return 'text-[#64748b] dark:text-muted-foreground'
}

function getQuotaLogBadgeTone(type: string) {
  if (type === 'admin_add' || type === 'admin_refund') return 'success'
  if (type === 'create_cdk' || type === 'admin_deduct') return 'danger'
  return 'neutral'
}

function getCodeBadgeTone(code: EnterpriseCdkCode) {
  const status = getCodeStatus(code)
  if (status === '未兑换') return 'warning'
  if (status === '已兑换') return 'success'
  if (status === '已禁用') return 'danger'
  return 'neutral'
}

function getOperationBadgeTone(action: string) {
  if (action === 'whitelist_add') return 'success'
  if (action === 'whitelist_remove' || action === 'recycle_cdks')
    return 'danger'
  if (action === 'toggle_cdk' || action === 'limit_update') return 'warning'
  if (
    action === 'export_user' ||
    action === 'export_admin' ||
    action === 'copy_unused'
  )
    return 'info'
  return 'neutral'
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
