import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { requireServerSuccess } from '@/lib/server-error-message'

import { getUsageDaily, getUsageSummary, listUsageDetail } from '../api'
import { FINANCE_PAGE_SIZE, FINANCE_QUERY_KEY } from '../constants'
import type { UsageRangeParams, UsageScope } from '../types'

export type UsageBreakdownParams = UsageRangeParams & { enabled?: boolean }

const usageKey = (kind: string, params: UsageRangeParams) => [
  FINANCE_QUERY_KEY,
  'usage',
  kind,
  params.scope,
  params.scope === 'admin' ? params.user_id : 0,
  params.ts_start,
  params.ts_end,
]

/** admin 主体必须有合法 user_id；self 主体总是可查 */
export function usageScopeReady(params: UsageRangeParams): boolean {
  return params.scope === 'self' || params.user_id > 0
}

export function useUsageSummary(params: UsageBreakdownParams) {
  return useQuery({
    queryKey: usageKey('summary', params),
    queryFn: async () =>
      requireServerSuccess(await getUsageSummary(params)).data ?? null,
    enabled: params.enabled !== false && usageScopeReady(params),
    placeholderData: keepPreviousData,
  })
}

export function useUsageDaily(params: UsageBreakdownParams) {
  return useQuery({
    queryKey: usageKey('daily', params),
    queryFn: async () =>
      requireServerSuccess(await getUsageDaily(params)).data ?? null,
    enabled: params.enabled !== false && usageScopeReady(params),
    placeholderData: keepPreviousData,
  })
}

export function useUsageDetail(
  params: UsageBreakdownParams & { page: number; pageSize?: number }
) {
  const pageSize = params.pageSize ?? FINANCE_PAGE_SIZE
  const scope: UsageScope =
    params.scope === 'admin'
      ? { scope: 'admin', user_id: params.user_id }
      : { scope: 'self' }
  return useQuery({
    queryKey: [...usageKey('detail', params), params.page, pageSize],
    queryFn: async () =>
      requireServerSuccess(
        await listUsageDetail({
          ...scope,
          ts_start: params.ts_start,
          ts_end: params.ts_end,
          p: params.page,
          page_size: pageSize,
        })
      ).data ?? { items: [], total: 0, page: params.page, page_size: pageSize },
    enabled: params.enabled !== false && usageScopeReady(params),
    placeholderData: keepPreviousData,
  })
}
