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

type BuildCCSwitchURLParams = {
  app: string
  name: string
  models: Record<string, string>
  apiKey: string
  serverAddress: string
  includeUsageScript?: boolean
  usageAutoInterval?: number
}

const newApiTokenUsageScript = `({
  request: {
    url: "{{baseUrl}}/api/usage/token/",
    method: "GET",
    headers: {
      "Authorization": "Bearer {{apiKey}}",
      "User-Agent": "cc-switch/1.0"
    }
  },
  extractor: function(response) {
    if (!response || response.success === false || response.code === false) {
      return {
        isValid: false,
        invalidMessage: response && response.message ? response.message : "Usage query failed"
      };
    }

    const data = response.data || response;
    const quotaPerUnit = 500000;
    const remainingQuota = Number(data.total_available ?? data.total_remaining ?? data.remaining ?? data.balance ?? 0);
    const usedQuota = Number(data.total_used ?? data.used ?? 0);
    const totalQuota = Number(data.total_granted ?? data.total ?? (remainingQuota + usedQuota));
    const unlimitedQuota = data.unlimited_quota === true;

    return {
      planName: data.name || "NewAPI Token",
      remaining: unlimitedQuota ? 100000000 : remainingQuota / quotaPerUnit,
      used: usedQuota / quotaPerUnit,
      total: unlimitedQuota ? 100000000 : totalQuota / quotaPerUnit,
      unit: "USD"
    };
  }
})`

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export function buildCCSwitchURL({
  app,
  name,
  models,
  apiKey,
  serverAddress,
  includeUsageScript = true,
  usageAutoInterval = 5,
}: BuildCCSwitchURLParams): string {
  const normalizedServerAddress = serverAddress.replace(/\/+$/, '')
  const endpoint =
    app === 'codex'
      ? `${normalizedServerAddress}/v1`
      : normalizedServerAddress
  const params = new URLSearchParams()
  params.set('resource', 'provider')
  params.set('app', app)
  params.set('name', name)
  params.set('endpoint', endpoint)
  params.set('apiKey', apiKey)
  for (const [k, v] of Object.entries(models)) {
    if (v) params.set(k, v)
  }
  params.set('homepage', normalizedServerAddress)
  params.set('enabled', 'true')

  if (includeUsageScript) {
    params.set('usageEnabled', 'true')
    params.set('usageBaseUrl', normalizedServerAddress)
    params.set('usageAutoInterval', String(usageAutoInterval))
    params.set('usageScript', encodeBase64(newApiTokenUsageScript))
  }

  return `ccswitch://v1/import?${params.toString()}`
}

