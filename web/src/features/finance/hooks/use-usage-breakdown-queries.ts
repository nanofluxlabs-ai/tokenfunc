import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { requireServerSuccess } from '@/lib/server-error-message'

import { getUsageDaily, getUsageSummary, listUsageDetail } from '../api'
import { FINANCE_PAGE_SIZE, FINANCE_QUERY_KEY } from '../constants'
import type { UsageRangeParams, UsageScope } from '../types'

export type UsageBreakdownParams = UsageRangeParams & { enabled?: boolean }

/** 同一主体同一区间带不带 bill_id 是两份数据（实时 logs vs 冻结件），key 里要分开 */
export const usageKey = (kind: string, params: UsageRangeParams) => [
  FINANCE_QUERY_KEY,
  'usage',
  kind,
  params.scope,
  params.scope === 'admin' ? params.user_id : 0,
  params.scope === 'admin' ? (params.bill_id ?? 0) : 0,
  params.ts_start,
  params.ts_end,
]

/** 从带页码等附加字段的参数里只取主体部分 */
export function usageScopeOf(params: UsageRangeParams): UsageScope {
  if (params.scope === 'admin') {
    return { scope: 'admin', user_id: params.user_id, bill_id: params.bill_id }
  }
  return { scope: 'self' }
}

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
  const scope = usageScopeOf(params)
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
