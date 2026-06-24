import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Edit,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestampToDate } from '@/lib/format'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import {
  channelMonitorsQueryKey,
  createChannelMonitor,
  createChannelMonitorTemplate,
  deleteChannelMonitor,
  deleteChannelMonitorTemplate,
  listChannelMonitors,
  listChannelMonitorTemplates,
  runChannelMonitor,
  updateChannelMonitor,
  updateChannelMonitorTemplate,
} from './api'
import type {
  ChannelMonitor,
  ChannelMonitorAPIMode,
  ChannelMonitorBodyOverrideMode,
  ChannelMonitorPayload,
  ChannelMonitorProvider,
  ChannelMonitorTemplate,
  ChannelMonitorTemplatePayload,
} from './types'
import {
  ProviderBadge,
  StatusBadge,
  formatAvailability,
  getProviderIcon,
  providerOptions,
} from './utils'

type MonitorFormState = {
  name: string
  provider: ChannelMonitorProvider
  api_mode: ChannelMonitorAPIMode
  endpoint: string
  api_key: string
  primary_model: string
  extra_models: string
  group_name: string
  enabled: boolean
  interval_seconds: string
  template_id: string
  extra_headers: string
  body_override_mode: ChannelMonitorBodyOverrideMode
  body_override: string
}

type TemplateFormState = {
  name: string
  provider: ChannelMonitorProvider
  api_mode: ChannelMonitorAPIMode
  extra_headers: string
  body_override_mode: ChannelMonitorBodyOverrideMode
  body_override: string
}

const emptyMonitorForm: MonitorFormState = {
  name: '',
  provider: 'openai',
  api_mode: 'chat_completions',
  endpoint: '',
  api_key: '',
  primary_model: '',
  extra_models: '',
  group_name: '',
  enabled: true,
  interval_seconds: '60',
  template_id: '0',
  extra_headers: '',
  body_override_mode: 'off',
  body_override: '',
}

const emptyTemplateForm: TemplateFormState = {
  name: '',
  provider: 'openai',
  api_mode: 'chat_completions',
  extra_headers: '',
  body_override_mode: 'off',
  body_override: '',
}

const apiModeOptions: Array<{ value: ChannelMonitorAPIMode; label: string }> = [
  { value: 'chat_completions', label: 'Chat Completions' },
  { value: 'responses', label: 'Responses' },
]

const overrideModeOptions: Array<{
  value: ChannelMonitorBodyOverrideMode
  label: string
}> = [
  { value: 'off', label: 'Off' },
  { value: 'merge', label: 'Merge' },
  { value: 'replace', label: 'Replace' },
]

function splitModels(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildMonitorForm(monitor: ChannelMonitor | null): MonitorFormState {
  if (!monitor) return emptyMonitorForm
  return {
    name: monitor.name,
    provider: monitor.provider,
    api_mode: monitor.api_mode || 'chat_completions',
    endpoint: monitor.endpoint,
    api_key: '',
    primary_model: monitor.primary_model,
    extra_models: monitor.extra_models.join('\n'),
    group_name: monitor.group_name || '',
    enabled: monitor.enabled,
    interval_seconds: String(monitor.interval_seconds || 60),
    template_id: String(monitor.template_id || 0),
    extra_headers: monitor.extra_headers || '',
    body_override_mode: monitor.body_override_mode || 'off',
    body_override: monitor.body_override || '',
  }
}

function buildMonitorPayload(
  form: MonitorFormState,
  isEdit: boolean
): ChannelMonitorPayload {
  const payload: ChannelMonitorPayload = {
    name: form.name.trim(),
    provider: form.provider,
    api_mode: form.provider === 'openai' ? form.api_mode : 'chat_completions',
    endpoint: form.endpoint.trim(),
    primary_model: form.primary_model.trim(),
    extra_models: splitModels(form.extra_models),
    group_name: form.group_name.trim(),
    enabled: form.enabled,
    interval_seconds: Number(form.interval_seconds) || 60,
    template_id: Number(form.template_id) || 0,
    extra_headers: form.extra_headers.trim(),
    body_override_mode: form.body_override_mode,
    body_override: form.body_override.trim(),
  }
  if (form.api_key.trim() || !isEdit) {
    payload.api_key = form.api_key.trim()
  }
  return payload
}

function buildTemplateForm(
  template: ChannelMonitorTemplate | null
): TemplateFormState {
  if (!template) return emptyTemplateForm
  return {
    name: template.name,
    provider: template.provider,
    api_mode: template.api_mode || 'chat_completions',
    extra_headers: template.extra_headers || '',
    body_override_mode: template.body_override_mode || 'off',
    body_override: template.body_override || '',
  }
}

function buildTemplatePayload(
  form: TemplateFormState
): ChannelMonitorTemplatePayload {
  return {
    name: form.name.trim(),
    provider: form.provider,
    api_mode: form.provider === 'openai' ? form.api_mode : 'chat_completions',
    extra_headers: form.extra_headers.trim(),
    body_override_mode: form.body_override_mode,
    body_override: form.body_override.trim(),
  }
}

function MonitorDialog({
  monitor,
  open,
  templates,
  onOpenChange,
}: {
  monitor: ChannelMonitor | null
  open: boolean
  templates: ChannelMonitorTemplate[]
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = Boolean(monitor)
  const [form, setForm] = useState<MonitorFormState>(emptyMonitorForm)

  useEffect(() => {
    setForm(buildMonitorForm(monitor))
  }, [monitor, open])

  const matchingTemplates = templates.filter(
    (template) =>
      template.provider === form.provider &&
      (form.provider !== 'openai' || template.api_mode === form.api_mode)
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (monitor) {
        return updateChannelMonitor(monitor.id, buildMonitorPayload(form, true))
      }
      return createChannelMonitor(buildMonitorPayload(form, false))
    },
    onSuccess: async (response) => {
      if (response.success) {
        toast.success(t('Saved successfully'))
        await queryClient.invalidateQueries({
          queryKey: channelMonitorsQueryKey,
        })
        onOpenChange(false)
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('Edit channel monitor') : t('Add channel monitor')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Monitor upstream availability, latency, endpoint ping, and model health.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='grid max-h-[68vh] gap-4 overflow-y-auto pr-1'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('Name')}</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder='gpt-Pro'
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('Provider')}</Label>
              <Select<ChannelMonitorProvider>
                items={providerOptions}
                value={form.provider}
                onValueChange={(value) => {
                  if (!value) return
                  setForm({
                    ...form,
                    provider: value,
                    api_mode:
                      value === 'openai' ? form.api_mode : 'chat_completions',
                  })
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {providerOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className='flex items-center gap-2'>
                          {getProviderIcon(option.value, 16)}
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('Endpoint')}</Label>
              <Input
                value={form.endpoint}
                onChange={(event) =>
                  setForm({ ...form, endpoint: event.target.value })
                }
                placeholder='https://api.openai.com'
              />
            </div>
            <div className='grid gap-2'>
              <Label>
                {isEdit
                  ? t('API Key (leave blank to keep unchanged)')
                  : t('API Key')}
              </Label>
              <Input
                value={form.api_key}
                onChange={(event) =>
                  setForm({ ...form, api_key: event.target.value })
                }
                type='password'
                placeholder={monitor?.api_key_masked || 'sk-...'}
              />
            </div>
          </div>

          <div className='grid gap-3 sm:grid-cols-3'>
            <div className='grid gap-2'>
              <Label>{t('Primary model')}</Label>
              <Input
                value={form.primary_model}
                onChange={(event) =>
                  setForm({ ...form, primary_model: event.target.value })
                }
                placeholder='gpt-5.4-mini'
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('Group name')}</Label>
              <Input
                value={form.group_name}
                onChange={(event) =>
                  setForm({ ...form, group_name: event.target.value })
                }
                placeholder={t('Optional')}
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('Interval seconds')}</Label>
              <Input
                value={form.interval_seconds}
                onChange={(event) =>
                  setForm({ ...form, interval_seconds: event.target.value })
                }
                inputMode='numeric'
              />
            </div>
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('Extra models')}</Label>
              <Textarea
                value={form.extra_models}
                onChange={(event) =>
                  setForm({ ...form, extra_models: event.target.value })
                }
                placeholder={t('One model per line, optional')}
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('Request template')}</Label>
              <Select<string>
                items={[
                  { value: '0', label: t('No template') },
                  ...matchingTemplates.map((template) => ({
                    value: String(template.id),
                    label: template.name,
                  })),
                ]}
                value={form.template_id}
                onValueChange={(value) => {
                  if (!value) return
                  const selected = templates.find(
                    (template) => String(template.id) === value
                  )
                  setForm({
                    ...form,
                    template_id: value,
                    extra_headers:
                      selected?.extra_headers ?? form.extra_headers,
                    body_override_mode:
                      selected?.body_override_mode ?? form.body_override_mode,
                    body_override:
                      selected?.body_override ?? form.body_override,
                  })
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='0'>{t('No template')}</SelectItem>
                    {matchingTemplates.map((template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {form.provider === 'openai' && (
                <Select<ChannelMonitorAPIMode>
                  items={apiModeOptions}
                  value={form.api_mode}
                  onValueChange={(value) => {
                    if (!value) return
                    setForm({ ...form, api_mode: value })
                  }}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {apiModeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('Extra headers JSON')}</Label>
              <Textarea
                value={form.extra_headers}
                onChange={(event) =>
                  setForm({ ...form, extra_headers: event.target.value })
                }
                placeholder='{"X-Header":"value"}'
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('Body override')}</Label>
              <Select<ChannelMonitorBodyOverrideMode>
                items={overrideModeOptions}
                value={form.body_override_mode}
                onValueChange={(value) => {
                  if (!value) return
                  setForm({ ...form, body_override_mode: value })
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {overrideModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Textarea
                value={form.body_override}
                onChange={(event) =>
                  setForm({ ...form, body_override: event.target.value })
                }
                placeholder='{"temperature":0}'
              />
            </div>
          </div>

          <div className='flex items-center justify-between rounded-md border px-3 py-2'>
            <div>
              <div className='text-sm font-medium'>{t('Enabled')}</div>
              <div className='text-muted-foreground text-xs'>
                {t('Enabled monitors are visible on the channel status page.')}
              </div>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) =>
                setForm({ ...form, enabled: checked })
              }
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

function TemplateManagerDialog({
  open,
  templates,
  onOpenChange,
}: {
  open: boolean
  templates: ChannelMonitorTemplate[]
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ChannelMonitorTemplate | null>(null)
  const [form, setForm] = useState<TemplateFormState>(emptyTemplateForm)

  useEffect(() => {
    setForm(buildTemplateForm(editing))
  }, [editing])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return updateChannelMonitorTemplate(
          editing.id,
          buildTemplatePayload(form)
        )
      }
      return createChannelMonitorTemplate(buildTemplatePayload(form))
    },
    onSuccess: async (response) => {
      if (response.success) {
        toast.success(t('Saved successfully'))
        await queryClient.invalidateQueries({
          queryKey: [...channelMonitorsQueryKey, 'templates'],
        })
        setEditing(null)
        setForm(emptyTemplateForm)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChannelMonitorTemplate,
    onSuccess: async (response) => {
      if (response.success) {
        toast.success(t('Deleted successfully'))
        await queryClient.invalidateQueries({
          queryKey: [...channelMonitorsQueryKey, 'templates'],
        })
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>{t('Template management')}</DialogTitle>
          <DialogDescription>
            {t(
              'Templates snapshot request headers and body override settings.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 lg:grid-cols-[1fr_1.1fr]'>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>
                {editing ? t('Edit template') : t('Add template')}
              </CardTitle>
            </CardHeader>
            <CardContent className='grid gap-3'>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder={t('Template name')}
              />
              <div className='grid gap-2 sm:grid-cols-2'>
                <Select<ChannelMonitorProvider>
                  items={providerOptions}
                  value={form.provider}
                  onValueChange={(value) => {
                    if (!value) return
                    setForm({
                      ...form,
                      provider: value,
                      api_mode:
                        value === 'openai' ? form.api_mode : 'chat_completions',
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {providerOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select<ChannelMonitorAPIMode>
                  items={apiModeOptions}
                  value={form.api_mode}
                  onValueChange={(value) => {
                    if (!value) return
                    setForm({ ...form, api_mode: value })
                  }}
                  disabled={form.provider !== 'openai'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {apiModeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={form.extra_headers}
                onChange={(event) =>
                  setForm({ ...form, extra_headers: event.target.value })
                }
                placeholder={t('Extra headers JSON')}
              />
              <Select<ChannelMonitorBodyOverrideMode>
                items={overrideModeOptions}
                value={form.body_override_mode}
                onValueChange={(value) => {
                  if (!value) return
                  setForm({ ...form, body_override_mode: value })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {overrideModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Textarea
                value={form.body_override}
                onChange={(event) =>
                  setForm({ ...form, body_override: event.target.value })
                }
                placeholder={t('Body override JSON')}
              />
              <div className='flex gap-2'>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {t('Save')}
                </Button>
                {editing && (
                  <Button
                    variant='outline'
                    onClick={() => {
                      setEditing(null)
                      setForm(emptyTemplateForm)
                    }}
                  >
                    {t('Cancel')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Name')}</TableHead>
                  <TableHead>{t('Provider')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className='font-medium'>
                      {template.name}
                    </TableCell>
                    <TableCell>
                      <ProviderBadge provider={template.provider} />
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        onClick={() => setEditing(template)}
                      >
                        <Edit className='size-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        onClick={() => deleteMutation.mutate(template.id)}
                      >
                        <Trash2 className='size-4' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ChannelMonitorAdminPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [provider, setProvider] = useState('all')
  const [enabled, setEnabled] = useState('all')
  const [editing, setEditing] = useState<ChannelMonitor | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChannelMonitor | null>(null)

  const queryParams = useMemo(
    () => ({
      search,
      provider: provider === 'all' ? '' : provider,
      enabled: enabled === 'all' ? '' : enabled,
      page_size: 100,
    }),
    [enabled, provider, search]
  )

  const monitorsQuery = useQuery({
    queryKey: [...channelMonitorsQueryKey, queryParams],
    queryFn: () => listChannelMonitors(queryParams),
  })
  const templatesQuery = useQuery({
    queryKey: [...channelMonitorsQueryKey, 'templates'],
    queryFn: listChannelMonitorTemplates,
  })

  const monitors = monitorsQuery.data?.data?.items || []
  const templates = templatesQuery.data?.data || []

  const runMutation = useMutation({
    mutationFn: runChannelMonitor,
    onMutate: () => {
      toast.info(t('Check started'))
    },
    onSuccess: async (response) => {
      if (response.success) {
        toast.success(t('Check completed'))
      } else {
        toast.error(response.message || t('Check failed'))
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: channelMonitorsQueryKey })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (monitor: ChannelMonitor) =>
      updateChannelMonitor(monitor.id, {
        name: monitor.name,
        provider: monitor.provider,
        api_mode: monitor.api_mode,
        endpoint: monitor.endpoint,
        primary_model: monitor.primary_model,
        extra_models: monitor.extra_models,
        group_name: monitor.group_name,
        enabled: !monitor.enabled,
        interval_seconds: monitor.interval_seconds,
        template_id: monitor.template_id,
        extra_headers: monitor.extra_headers,
        body_override_mode: monitor.body_override_mode,
        body_override: monitor.body_override,
      }),
    onSuccess: async (response) => {
      if (response.success) {
        await queryClient.invalidateQueries({
          queryKey: channelMonitorsQueryKey,
        })
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (monitor: ChannelMonitor) => deleteChannelMonitor(monitor.id),
    onSuccess: async (response) => {
      if (response.success) {
        toast.success(t('Deleted successfully'))
        await queryClient.invalidateQueries({
          queryKey: channelMonitorsQueryKey,
        })
        setDeleteTarget(null)
      }
    },
  })

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Channel Monitor')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Monitor channel availability, latency, and status')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          onClick={async () => {
            await queryClient.invalidateQueries({
              queryKey: channelMonitorsQueryKey,
            })
            toast.success(t('Refreshed'))
          }}
        >
          <RefreshCw className='size-4' />
          {t('Refresh')}
        </Button>
        <Button variant='outline' onClick={() => setTemplatesOpen(true)}>
          <Settings2 className='size-4' />
          {t('Template management')}
        </Button>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className='size-4' />
          {t('Add monitor')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <Card>
          <CardHeader className='gap-3'>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
              <div>
                <CardTitle>{t('Channel Monitor')}</CardTitle>
                <CardDescription>
                  {t('Configure monitored upstream endpoints and models')}
                </CardDescription>
              </div>
              <div className='grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_140px]'>
                <div className='relative'>
                  <Search className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2' />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className='pl-9'
                    placeholder={t('Search monitor name...')}
                  />
                </div>
                <Select<string>
                  items={[
                    { value: 'all', label: t('All providers') },
                    ...providerOptions.map((item) => ({
                      value: item.value,
                      label: item.label,
                    })),
                  ]}
                  value={provider}
                  onValueChange={(value) => value && setProvider(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='all'>{t('All providers')}</SelectItem>
                      {providerOptions.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select<string>
                  items={[
                    { value: 'all', label: t('All status') },
                    { value: 'true', label: t('Enabled') },
                    { value: 'false', label: t('Disabled') },
                  ]}
                  value={enabled}
                  onValueChange={(value) => value && setEnabled(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='all'>{t('All status')}</SelectItem>
                      <SelectItem value='true'>{t('Enabled')}</SelectItem>
                      <SelectItem value='false'>{t('Disabled')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className='overflow-hidden rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Name')}</TableHead>
                    <TableHead>{t('Provider')}</TableHead>
                    <TableHead>{t('Primary model')}</TableHead>
                    <TableHead>{t('7d Availability')}</TableHead>
                    <TableHead>{t('Latency (MS)')}</TableHead>
                    <TableHead>{t('Enabled')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monitors.map((monitor) => {
                    const isRunning =
                      runMutation.isPending &&
                      runMutation.variables === monitor.id
                    return (
                      <TableRow key={monitor.id}>
                        <TableCell className='font-medium'>
                          <div className='flex flex-col'>
                            <span>{monitor.name}</span>
                            <span className='text-muted-foreground text-xs'>
                              {monitor.last_checked_at
                                ? formatTimestampToDate(monitor.last_checked_at)
                                : t('Not checked')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <ProviderBadge provider={monitor.provider} />
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <span>{monitor.primary_model}</span>
                            <StatusBadge status={monitor.primary_status} />
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatAvailability(monitor.availability_7d)}
                        </TableCell>
                        <TableCell>
                          {monitor.primary_latency_ms || '--'}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={monitor.enabled}
                            onCheckedChange={() =>
                              toggleMutation.mutate(monitor)
                            }
                          />
                        </TableCell>
                        <TableCell className='text-right'>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            onClick={() => runMutation.mutate(monitor.id)}
                            disabled={isRunning}
                            title={t('Run check now')}
                          >
                            <RotateCw
                              className={`size-4 ${isRunning ? 'animate-spin' : ''}`}
                            />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            onClick={() => {
                              setEditing(monitor)
                              setDialogOpen(true)
                            }}
                            title={t('Edit')}
                          >
                            <Edit className='size-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            onClick={() => setDeleteTarget(monitor)}
                            title={t('Delete')}
                          >
                            <Trash2 className='size-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {!monitors.length && (
                    <TableRow>
                      <TableCell colSpan={7} className='h-24 text-center'>
                        {monitorsQuery.isLoading
                          ? t('Loading...')
                          : t('No channel monitor configured')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </SectionPageLayout.Content>

      <MonitorDialog
        monitor={editing}
        open={dialogOpen}
        templates={templates}
        onOpenChange={setDialogOpen}
      />
      <TemplateManagerDialog
        open={templatesOpen}
        templates={templates}
        onOpenChange={setTemplatesOpen}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('Delete channel monitor')}
        desc={t('This will delete monitor history as well.')}
        confirmText={t('Delete')}
        destructive
        handleConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget)
        }}
      />
    </SectionPageLayout>
  )
}
