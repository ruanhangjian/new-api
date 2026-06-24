import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Edit,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'
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
import { Empty } from '@/components/ui/empty'
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
import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
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
import {
  filterActiveMonitorApiKeys,
  formatMonitorTokenDisplay,
  getInvalidMonitorHeaderName,
  monitorHeaderRowsToJSON,
  monitorHeadersToRows,
  type MonitorHeaderRow,
  normalizeMonitorTokenKey,
  splitMonitorModels,
} from './form-utils'
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
  provider: 'anthropic',
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
    extra_models: splitMonitorModels(form.extra_models),
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

function RequiredMark() {
  return <span className='text-destructive'>*</span>
}

function LabeledField({
  label,
  required,
  children,
  hint,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className='grid gap-2'>
      <Label className='text-sm font-semibold'>
        {label} {required && <RequiredMark />}
      </Label>
      {children}
      {hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
    </div>
  )
}

function clearMonitorRequestSnapshot(form: MonitorFormState): MonitorFormState {
  return {
    ...form,
    template_id: '0',
    extra_headers: '',
    body_override_mode: 'off',
    body_override: '',
  }
}

function ProviderPicker({
  value,
  onChange,
}: {
  value: ChannelMonitorProvider
  onChange: (value: ChannelMonitorProvider) => void
}) {
  return (
    <div className='grid grid-cols-3 gap-3'>
      {providerOptions.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type='button'
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground flex h-11 items-center justify-center gap-2 rounded-lg border-2 px-3 text-sm font-semibold transition-colors',
              active &&
                'border-primary bg-primary/10 text-primary dark:bg-primary/15 shadow-sm'
            )}
          >
            {getProviderIcon(option.value, 18)}
            <span className='truncate'>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ApiModePicker({
  value,
  onChange,
}: {
  value: ChannelMonitorAPIMode
  onChange: (value: ChannelMonitorAPIMode) => void
}) {
  const { t } = useTranslation()
  const options: Array<{
    value: ChannelMonitorAPIMode
    label: string
    hint: string
  }> = [
    {
      value: 'chat_completions',
      label: 'Chat Completions',
      hint: t('Uses /v1/chat/completions. Best for most compatible services.'),
    },
    {
      value: 'responses',
      label: 'Responses',
      hint: t('Uses /v1/responses. Best for NewAPI self checks and Codex.'),
    },
  ]
  return (
    <div className='border-primary/15 bg-primary/5 grid gap-3 rounded-lg border p-3'>
      <Label className='text-sm font-semibold'>{t('OpenAI protocol')}</Label>
      <div className='grid gap-3 sm:grid-cols-2'>
        {options.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type='button'
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'border-border bg-card text-muted-foreground hover:border-primary/50 rounded-lg border-2 px-3 py-2 text-left transition-colors',
                active &&
                  'border-primary bg-background text-primary dark:bg-primary/15 shadow-sm'
              )}
            >
              <span className='block text-sm font-semibold'>
                {option.label}
              </span>
              <span className='mt-0.5 block text-xs'>{option.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ModelTagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const { t } = useTranslation()
  const models = splitMonitorModels(value)
  const [draft, setDraft] = useState('')

  const commitModels = (items: string[]) => onChange(items.join('\n'))
  const addDraft = () => {
    const next = splitMonitorModels(draft)
    if (!next.length) return
    commitModels([...new Set([...models, ...next])])
    setDraft('')
  }
  const removeModel = (target: string) => {
    commitModels(models.filter((model) => model !== target))
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      addDraft()
    }
    if (event.key === 'Backspace' && !draft && models.length) {
      removeModel(models[models.length - 1])
    }
  }

  return (
    <div>
      <div className='border-input bg-background focus-within:border-ring focus-within:ring-ring/50 flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-[color,box-shadow] focus-within:ring-3'>
        {models.map((model) => (
          <Badge
            key={model}
            variant='secondary'
            className='h-6 rounded-md pr-1'
          >
            <span className='max-w-52 truncate'>{model}</span>
            <button
              type='button'
              onClick={() => removeModel(model)}
              className='hover:bg-muted-foreground/15 ml-1 rounded-full p-0.5'
              title={t('Delete')}
            >
              <X className='size-3' />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addDraft}
          onPaste={(event) => {
            event.preventDefault()
            const text = event.clipboardData.getData('text')
            const next = splitMonitorModels(text)
            if (next.length) commitModels([...new Set([...models, ...next])])
          }}
          className='placeholder:text-muted-foreground min-w-36 flex-1 bg-transparent text-sm outline-none'
          placeholder={models.length ? '' : placeholder}
        />
      </div>
      <p className='text-muted-foreground mt-1 text-xs'>
        {t('Press Enter to add, supports paste for batch import.')}
      </p>
    </div>
  )
}

function AdvancedRequestConfig({
  form,
  templates,
  onChange,
}: {
  form: MonitorFormState
  templates: ChannelMonitorTemplate[]
  onChange: (form: MonitorFormState) => void
}) {
  const { t } = useTranslation()
  const [headerRows, setHeaderRows] = useState<MonitorHeaderRow[]>(
    monitorHeadersToRows(form.extra_headers)
  )
  const [headersError, setHeadersError] = useState('')
  const [bodyError, setBodyError] = useState('')

  useEffect(() => {
    setHeaderRows(monitorHeadersToRows(form.extra_headers))
    setHeadersError('')
  }, [form.extra_headers])

  const matchingTemplates = templates.filter(
    (template) =>
      template.provider === form.provider &&
      (form.provider !== 'openai' || template.api_mode === form.api_mode)
  )
  const bodyModeHint = {
    off: t('Use the default monitor request body.'),
    merge: t('Shallow merge JSON fields into the default request body.'),
    replace: t('Replace the request body completely with the JSON below.'),
  }[form.body_override_mode]
  const bodyPlaceholder =
    form.provider === 'openai' && form.api_mode === 'responses'
      ? form.body_override_mode === 'merge'
        ? '{\n  "max_output_tokens": 20\n}'
        : '{\n  "model": "gpt-4o-mini",\n  "instructions": "You are a health check endpoint. Reply briefly.",\n  "input": "Reply with exactly: ok",\n  "max_output_tokens": 20,\n  "stream": false\n}'
      : form.provider === 'openai'
        ? form.body_override_mode === 'merge'
          ? '{\n  "max_tokens": 20\n}'
          : '{\n  "model": "gpt-4o-mini",\n  "messages": [{"role":"user","content":"Reply with exactly: ok"}],\n  "max_tokens": 20,\n  "stream": false\n}'
        : form.body_override_mode === 'merge'
          ? '{\n  "system": "You are Claude Code..."\n}'
          : '{\n  "model": "claude-x",\n  "messages": [{"role":"user","content":"hi"}],\n  "max_tokens": 10\n}'

  const updateHeaderRow = (index: number, patch: Partial<MonitorHeaderRow>) => {
    setHeaderRows((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    )
  }
  const commitHeaders = (rows = headerRows) => {
    const invalid = getInvalidMonitorHeaderName(rows)
    if (invalid) {
      setHeadersError(
        t('Header name "{{name}}" cannot contain spaces or colon.', {
          name: invalid,
        })
      )
      return
    }
    setHeadersError('')
    onChange({ ...form, extra_headers: monitorHeaderRowsToJSON(rows) })
  }
  const addHeaderRow = () => {
    setHeaderRows((rows) => [...rows, { name: '', value: '' }])
  }
  const removeHeaderRow = (index: number) => {
    const next = headerRows.filter((_, rowIndex) => rowIndex !== index)
    const normalized = next.length ? next : [{ name: '', value: '' }]
    setHeaderRows(normalized)
    commitHeaders(normalized)
  }
  const formatBodyOverride = () => {
    const trimmed = form.body_override.trim()
    if (!trimmed) return
    try {
      const parsed = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setBodyError(t('Request body JSON must be an object.'))
        return
      }
      setBodyError('')
      onChange({ ...form, body_override: JSON.stringify(parsed, null, 2) })
    } catch (error) {
      setBodyError(
        `${t('Request body JSON is invalid')}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  return (
    <details className='border-border bg-muted/30 rounded-lg border p-3'>
      <summary className='flex cursor-pointer list-none items-center justify-between text-sm font-semibold'>
        <span>{t('Advanced settings')}</span>
        <ChevronDown className='size-4' />
      </summary>
      <p className='text-muted-foreground mt-1 text-xs'>
        {t(
          'Customize request headers and body for upstream services with special client requirements.'
        )}
      </p>

      <div className='mt-4 grid gap-4'>
        <LabeledField
          label={t('Request template')}
          hint={t(
            'Selecting a template copies its headers and body override into this monitor.'
          )}
        >
          <Select<string>
            items={[
              { value: '0', label: t('No template') },
              ...matchingTemplates.map((template) => ({
                value: String(template.id),
                label:
                  template.provider === 'openai'
                    ? `${template.name} · ${template.api_mode === 'responses' ? 'Responses' : 'Chat Completions'}`
                    : template.name,
              })),
            ]}
            value={form.template_id}
            onValueChange={(value) => {
              if (!value) return
              const selected = templates.find(
                (template) => String(template.id) === value
              )
              onChange({
                ...form,
                template_id: value,
                api_mode:
                  selected?.provider === 'openai'
                    ? selected.api_mode
                    : form.api_mode,
                extra_headers: selected?.extra_headers ?? form.extra_headers,
                body_override_mode:
                  selected?.body_override_mode ?? form.body_override_mode,
                body_override: selected?.body_override ?? form.body_override,
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
                    {template.provider === 'openai'
                      ? `${template.name} · ${template.api_mode === 'responses' ? 'Responses' : 'Chat Completions'}`
                      : template.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </LabeledField>

        <div className='grid gap-2'>
          <Label className='text-sm font-semibold'>{t('Extra headers')}</Label>
          <div className='grid gap-1.5'>
            {headerRows.map((row, index) => (
              <div key={index} className='flex items-center gap-2'>
                <Input
                  value={row.name}
                  onChange={(event) =>
                    updateHeaderRow(index, { name: event.target.value })
                  }
                  onBlur={() => commitHeaders()}
                  spellCheck={false}
                  className='w-52 flex-none font-mono text-xs'
                  placeholder={t('Header name')}
                />
                <Input
                  value={row.value}
                  onChange={(event) =>
                    updateHeaderRow(index, { value: event.target.value })
                  }
                  onBlur={() => commitHeaders()}
                  spellCheck={false}
                  className='min-w-0 flex-1 font-mono text-xs'
                  placeholder={t('Header value')}
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => removeHeaderRow(index)}
                  title={t('Delete')}
                >
                  <X className='size-4' />
                </Button>
              </div>
            ))}
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={addHeaderRow}
              className='w-fit border-dashed'
            >
              <Plus className='size-3.5' />
              {t('Add header row')}
            </Button>
          </div>
          {headersError ? (
            <p className='text-destructive text-xs'>{headersError}</p>
          ) : (
            <p className='text-muted-foreground text-xs'>
              {t(
                'Merged with default headers. Hop-by-hop headers are ignored by the backend.'
              )}
            </p>
          )}
        </div>

        <div className='grid gap-2'>
          <Label className='text-sm font-semibold'>
            {t('Request body handling')}
          </Label>
          <div className='grid grid-cols-3 gap-3'>
            {overrideModeOptions.map((option) => {
              const active = form.body_override_mode === option.value
              return (
                <button
                  key={option.value}
                  type='button'
                  onClick={() =>
                    onChange({
                      ...form,
                      body_override_mode: option.value,
                      body_override:
                        option.value === 'off' ? '' : form.body_override,
                    })
                  }
                  className={cn(
                    'border-border bg-card text-muted-foreground hover:border-primary/50 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors',
                    active &&
                      'border-primary bg-primary/10 text-primary dark:bg-primary/15'
                  )}
                >
                  {t(option.label)}
                </button>
              )
            })}
          </div>
          <p className='text-muted-foreground text-xs'>{bodyModeHint}</p>
        </div>

        {form.body_override_mode !== 'off' && (
          <LabeledField
            label={t('Body override JSON')}
            hint={t(
              'Must be a JSON object. It is applied according to the selected body handling mode.'
            )}
          >
            <div className='mb-1 flex justify-end'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={formatBodyOverride}
                disabled={!form.body_override.trim()}
              >
                {t('Format JSON')}
              </Button>
            </div>
            <Textarea
              value={form.body_override}
              onChange={(event) => {
                setBodyError('')
                onChange({ ...form, body_override: event.target.value })
              }}
              className='min-h-36 font-mono text-xs'
              placeholder={bodyPlaceholder}
            />
            {bodyError && (
              <p className='text-destructive mt-1 text-xs'>{bodyError}</p>
            )}
          </LabeledField>
        )}
      </div>
    </details>
  )
}

function MonitorKeyPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (key: string) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [loadingKeyId, setLoadingKeyId] = useState<number | null>(null)
  const keysQuery = useQuery({
    queryKey: ['channel-monitor', 'my-api-keys', open],
    queryFn: () => getApiKeys({ p: 1, size: 100 }),
    enabled: open,
  })
  const keys = keysQuery.data?.data?.items || []
  const filteredKeys = useMemo(
    () => filterActiveMonitorApiKeys(keys, search),
    [keys, search]
  )

  const handlePick = async (key: ApiKey) => {
    setLoadingKeyId(key.id)
    try {
      const response = await fetchTokenKey(key.id)
      if (response.success && response.data?.key) {
        onPick(normalizeMonitorTokenKey(response.data.key))
        onOpenChange(false)
        return
      }
      toast.error(response.message || t('Failed to load API key'))
    } catch {
      toast.error(t('Failed to load API key'))
    } finally {
      setLoadingKeyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Select my API Key')}</DialogTitle>
          <DialogDescription>
            {t('Only enabled and non-expired keys are shown.')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          <div className='relative'>
            <Search className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2' />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className='pl-9'
              placeholder={t('Search API key name, key, or group...')}
            />
          </div>
          <div className='max-h-96 overflow-auto rounded-lg border'>
            {keysQuery.isLoading ? (
              <div className='text-muted-foreground flex h-32 items-center justify-center gap-2 text-sm'>
                <Loader2 className='size-4 animate-spin' />
                {t('Loading...')}
              </div>
            ) : filteredKeys.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Name')}</TableHead>
                    <TableHead>{t('API Key')}</TableHead>
                    <TableHead>{t('Group')}</TableHead>
                    <TableHead className='w-10' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKeys.map((key) => (
                    <TableRow
                      key={key.id}
                      className='cursor-pointer'
                      onClick={() => handlePick(key)}
                    >
                      <TableCell className='font-medium'>{key.name}</TableCell>
                      <TableCell className='font-mono text-xs'>
                        {formatMonitorTokenDisplay(key.key)}
                      </TableCell>
                      <TableCell>
                        {key.group ? (
                          <Badge variant='outline'>{key.group}</Badge>
                        ) : (
                          <span className='text-muted-foreground'>--</span>
                        )}
                      </TableCell>
                      <TableCell className='w-10'>
                        {loadingKeyId === key.id && (
                          <Loader2 className='size-4 animate-spin' />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Empty className='h-32 border-0'>
                <KeyRound className='text-muted-foreground size-5' />
                <p className='text-muted-foreground text-sm'>
                  {t('No active API key available')}
                </p>
              </Empty>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
  const [keyPickerOpen, setKeyPickerOpen] = useState(false)

  useEffect(() => {
    if (open) setForm(buildMonitorForm(monitor))
  }, [monitor, open])

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim()) {
      toast.error(t('Please enter a name'))
      return
    }
    if (!form.endpoint.trim()) {
      toast.error(t('Please enter endpoint'))
      return
    }
    if (!isEdit && !form.api_key.trim()) {
      toast.error(t('Please enter API Key'))
      return
    }
    if (!form.primary_model.trim()) {
      toast.error(t('Please enter primary model'))
      return
    }
    saveMutation.mutate()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='p-0 sm:max-w-5xl'>
          <form onSubmit={handleSubmit}>
            <DialogHeader className='border-b px-6 py-5'>
              <DialogTitle className='text-xl'>
                {isEdit ? t('Edit channel monitor') : t('Add channel monitor')}
              </DialogTitle>
            </DialogHeader>

            <div className='max-h-[72vh] space-y-5 overflow-y-auto px-6 py-5'>
              <LabeledField label={t('Name')} required>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder={t('Enter monitor name')}
                />
              </LabeledField>

              <LabeledField label={t('Platform')} required>
                <ProviderPicker
                  value={form.provider}
                  onChange={(provider) => {
                    const next = clearMonitorRequestSnapshot({
                      ...form,
                      provider,
                      api_key: '',
                      api_mode:
                        provider === 'openai'
                          ? form.api_mode
                          : 'chat_completions',
                    })
                    setForm(next)
                  }}
                />
              </LabeledField>

              {form.provider === 'openai' && (
                <ApiModePicker
                  value={form.api_mode}
                  onChange={(apiMode) =>
                    setForm(
                      clearMonitorRequestSnapshot({
                        ...form,
                        api_mode: apiMode,
                      })
                    )
                  }
                />
              )}

              <LabeledField label={t('Upstream endpoint')} required>
                <div className='flex gap-2'>
                  <Input
                    value={form.endpoint}
                    onChange={(event) =>
                      setForm({ ...form, endpoint: event.target.value })
                    }
                    className='flex-1'
                    placeholder='https://api.example.com'
                  />
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() =>
                      setForm({ ...form, endpoint: window.location.origin })
                    }
                    className='whitespace-nowrap'
                  >
                    {t('Use current service')}
                  </Button>
                </div>
              </LabeledField>

              <LabeledField
                label={t('API Key')}
                required={!isEdit}
                hint={
                  isEdit && monitor?.api_key_masked
                    ? monitor.api_key_masked
                    : undefined
                }
              >
                <div className='flex gap-2'>
                  <Input
                    value={form.api_key}
                    onChange={(event) =>
                      setForm({ ...form, api_key: event.target.value })
                    }
                    type='password'
                    className='flex-1'
                    placeholder={
                      isEdit
                        ? t('Leave empty to keep unchanged')
                        : t('Please enter API Key')
                    }
                  />
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setKeyPickerOpen(true)}
                    className='whitespace-nowrap'
                  >
                    {t('Use my Key')}
                  </Button>
                </div>
              </LabeledField>

              <LabeledField label={t('Primary model')} required>
                <Input
                  value={form.primary_model}
                  onChange={(event) =>
                    setForm({ ...form, primary_model: event.target.value })
                  }
                  className='font-medium'
                  placeholder='gpt-4o-mini'
                />
              </LabeledField>

              <LabeledField label={t('Extra models')}>
                <ModelTagInput
                  value={form.extra_models}
                  onChange={(extraModels) =>
                    setForm({ ...form, extra_models: extraModels })
                  }
                  placeholder={t('Press Enter to add extra models')}
                />
              </LabeledField>

              <div className='grid gap-5 sm:grid-cols-2'>
                <LabeledField label={t('Group name')}>
                  <Input
                    value={form.group_name}
                    onChange={(event) =>
                      setForm({ ...form, group_name: event.target.value })
                    }
                    placeholder={t('Optional, used for grouping in user view')}
                  />
                </LabeledField>
                <LabeledField
                  label={t('Interval seconds')}
                  required
                  hint={t('Range: 15 - 3600 seconds')}
                >
                  <Input
                    value={form.interval_seconds}
                    onChange={(event) =>
                      setForm({ ...form, interval_seconds: event.target.value })
                    }
                    type='number'
                    min={15}
                    max={3600}
                    inputMode='numeric'
                  />
                </LabeledField>
              </div>

              <div className='flex items-center justify-between rounded-lg border px-3 py-3'>
                <div>
                  <div className='text-sm font-semibold'>{t('Enabled')}</div>
                  <div className='text-muted-foreground text-xs'>
                    {t(
                      'Enabled monitors are visible on the channel status page.'
                    )}
                  </div>
                </div>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, enabled: checked })
                  }
                />
              </div>

              <AdvancedRequestConfig
                form={form}
                templates={templates}
                onChange={setForm}
              />
            </div>

            <DialogFooter className='border-t px-6 py-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
              >
                {t('Cancel')}
              </Button>
              <Button type='submit' disabled={saveMutation.isPending}>
                {saveMutation.isPending && (
                  <Loader2 className='size-4 animate-spin' />
                )}
                {isEdit ? t('Save') : t('Create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MonitorKeyPickerDialog
        open={keyPickerOpen}
        onOpenChange={setKeyPickerOpen}
        onPick={(apiKey) => setForm({ ...form, api_key: apiKey })}
      />
    </>
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
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
