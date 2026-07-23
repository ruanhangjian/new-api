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
export const IMAGE_WORKSHOP_ACTIVE_POLL_INTERVAL_MS = 2500
export const IMAGE_WORKSHOP_IDLE_POLL_INTERVAL_MS = 15_000
export const IMAGE_WORKSHOP_RATE_LIMIT_BACKOFF_MS = [
  15_000, 30_000, 60_000, 120_000,
] as const

export const IMAGE_WORKSHOP_POLLING_REQUEST_CONFIG = {
  disableDuplicate: true,
  skipBusinessError: true,
  skipErrorHandler: true,
} as const

function statusFrom(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function getHttpErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined

  const response = 'response' in error ? error.response : undefined
  if (response && typeof response === 'object' && 'status' in response) {
    const responseStatus = statusFrom(response.status)
    if (responseStatus !== undefined) return responseStatus
  }

  return 'status' in error ? statusFrom(error.status) : undefined
}

export function isImageWorkshopPollingRateLimited(error: unknown) {
  return getHttpErrorStatus(error) === 429
}

export function getNextImageWorkshopRateLimitFailureCount(
  currentCount: number,
  error: unknown
) {
  return isImageWorkshopPollingRateLimited(error)
    ? Math.max(0, Math.floor(currentCount)) + 1
    : 0
}

type ImageWorkshopPollingState = {
  hasActiveTasks: boolean
  error: unknown
  failureCount: number
}

export function getImageWorkshopPollingInterval({
  hasActiveTasks,
  error,
  failureCount,
}: ImageWorkshopPollingState) {
  if (isImageWorkshopPollingRateLimited(error)) {
    const backoffIndex = Math.min(
      Math.max(0, Math.floor(failureCount) - 1),
      IMAGE_WORKSHOP_RATE_LIMIT_BACKOFF_MS.length - 1
    )
    return IMAGE_WORKSHOP_RATE_LIMIT_BACKOFF_MS[backoffIndex]
  }

  return hasActiveTasks
    ? IMAGE_WORKSHOP_ACTIVE_POLL_INTERVAL_MS
    : IMAGE_WORKSHOP_IDLE_POLL_INTERVAL_MS
}
