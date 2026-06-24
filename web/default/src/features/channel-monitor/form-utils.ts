type MonitorApiKeyLike = {
  id: number
  name: string
  key: string
  group?: string | null
  status: number
  expired_time?: number | null
}

export type MonitorHeaderRow = {
  name: string
  value: string
}

export function splitMonitorModels(value: string) {
  const seen = new Set<string>()
  const models: string[] = []
  for (const item of value.split(/[,\n;]+/)) {
    const model = item.trim()
    if (!model || seen.has(model)) continue
    seen.add(model)
    models.push(model)
  }
  return models
}

export function isActiveMonitorApiKey(
  key: MonitorApiKeyLike,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (key.status !== 1) return false
  if (key.expired_time == null || key.expired_time === -1) return true
  return key.expired_time > nowSeconds
}

export function filterActiveMonitorApiKeys<T extends MonitorApiKeyLike>(
  keys: T[],
  search: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  const query = search.trim().toLowerCase()
  return keys.filter((key) => {
    if (!isActiveMonitorApiKey(key, nowSeconds)) return false
    if (!query) return true
    return (
      key.name.toLowerCase().includes(query) ||
      key.key.toLowerCase().includes(query) ||
      (key.group || '').toLowerCase().includes(query)
    )
  })
}

export function normalizeMonitorTokenKey(key: string) {
  const trimmed = key.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('sk-') ? trimmed : `sk-${trimmed}`
}

export function formatMonitorTokenDisplay(key: string) {
  const trimmed = key.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('sk-') ? trimmed : `sk-${trimmed}`
}

export function monitorHeadersToRows(value: string): MonitorHeaderRow[] {
  const fallback = [{ name: '', value: '' }]
  const trimmed = value.trim()
  if (!trimmed) return fallback

  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fallback
    }

    const rows = Object.entries(parsed).map(([name, rowValue]) => ({
      name,
      value:
        typeof rowValue === 'string'
          ? rowValue
          : JSON.stringify(rowValue, null, 2),
    }))
    return rows.length ? rows : fallback
  } catch {
    return fallback
  }
}

export function monitorHeaderRowsToJSON(rows: MonitorHeaderRow[]) {
  const headers: Record<string, string> = {}
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    headers[name] = row.value
  }

  return Object.keys(headers).length ? JSON.stringify(headers, null, 2) : ''
}

export function getInvalidMonitorHeaderName(rows: MonitorHeaderRow[]) {
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    if (name.includes(':') || /\s/.test(name)) return name
  }
  return ''
}
