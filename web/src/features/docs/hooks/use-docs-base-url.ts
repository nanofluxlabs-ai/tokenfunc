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
import { useMemo } from 'react'

import { useStatus } from '@/hooks/use-status'

/** Environment variable name used in code samples for the API key. */
export const DOCS_API_KEY_ENV = 'TOKENFUNC_API_KEY'

/** Shown when neither status nor window.location provides an origin (SSR/tests). */
export const DOCS_FALLBACK_BASE_URL = 'https://api.example.com'

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Resolve the gateway base URL the same way the pricing page does:
 * prefer the server-configured address from /api/status, fall back to the
 * current browser origin.
 */
export function resolveDocsBaseUrl(status: unknown, origin?: string): string {
  const record = status as Record<string, unknown> | null
  const dataRecord = record?.data as Record<string, unknown> | undefined
  const candidates = [
    record?.server_address,
    record?.serverAddress,
    dataRecord?.server_address,
    dataRecord?.serverAddress,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return stripTrailingSlash(candidate)
    }
  }
  if (origin) return stripTrailingSlash(origin)
  if (typeof window !== 'undefined') {
    return stripTrailingSlash(window.location.origin)
  }
  return DOCS_FALLBACK_BASE_URL
}

export function useDocsBaseUrl(): string {
  const { status } = useStatus()
  return useMemo(() => resolveDocsBaseUrl(status), [status])
}
