import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { requireServerSuccess } from '@/lib/server-error-message'

import { getUsageDaily, getUsageSummary, listUsageDetail } from '../api'
import { FINANCE_PAGE_SIZE, FINANCE_QUERY_KEY } from '../constants'
import type { UsageRangeParams } from '../types'

export type UsageBreakdownParams = UsageRangeParams & { enabled?: boolean }

const usageKey = (kind: string, params: UsageRangeParams) => [
  FINANCE_QUERY_KEY,
  'usage',
  kind,
  params.user_id,
  params.ts_start,
  params.ts_end,
]

export function useUsageSummary(params: UsageBreakdownParams) {
  return useQuery({
    queryKey: usageKey('summary', params),
    queryFn: async () =>
      requireServerSuccess(await getUsageSummary(params)).data ?? null,
    enabled: params.enabled !== false && params.user_id > 0,
    placeholderData: keepPreviousData,
  })
}

export function useUsageDaily(params: UsageBreakdownParams) {
  return useQuery({
    queryKey: usageKey('daily', params),
    queryFn: async () =>
      requireServerSuccess(await getUsageDaily(params)).data ?? null,
    enabled: params.enabled !== false && params.user_id > 0,
    placeholderData: keepPreviousData,
  })
}

export function useUsageDetail(
  params: UsageBreakdownParams & { page: number; pageSize?: number }
) {
  const pageSize = params.pageSize ?? FINANCE_PAGE_SIZE
  return useQuery({
    queryKey: [...usageKey('detail', params), params.page, pageSize],
    queryFn: async () =>
      requireServerSuccess(
        await listUsageDetail({
          user_id: params.user_id,
          ts_start: params.ts_start,
          ts_end: params.ts_end,
          p: params.page,
          page_size: pageSize,
        })
      ).data ?? { items: [], total: 0, page: params.page, page_size: pageSize },
    enabled: params.enabled !== false && params.user_id > 0,
    placeholderData: keepPreviousData,
  })
}
