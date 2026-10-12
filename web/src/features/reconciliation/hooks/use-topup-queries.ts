import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { FINANCE_PAGE_SIZE } from '@/features/finance/constants'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getTopupSummary, listTopupDetail, type TopupRangeParams } from '../api'
import { RECONCILIATION_QUERY_KEY } from '../constants'

export function useTopupSummary(params: TopupRangeParams) {
  return useQuery({
    queryKey: [
      RECONCILIATION_QUERY_KEY,
      'topup',
      'summary',
      params.ts_start,
      params.ts_end,
    ],
    queryFn: async () =>
      requireServerSuccess(await getTopupSummary(params)).data ?? null,
    placeholderData: keepPreviousData,
  })
}

export function useTopupDetail(
  params: TopupRangeParams & {
    source?: string
    page: number
    pageSize?: number
  }
) {
  const pageSize = params.pageSize ?? FINANCE_PAGE_SIZE
  return useQuery({
    queryKey: [
      RECONCILIATION_QUERY_KEY,
      'topup',
      'detail',
      params.ts_start,
      params.ts_end,
      params.source ?? '',
      params.page,
      pageSize,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listTopupDetail({
          ts_start: params.ts_start,
          ts_end: params.ts_end,
          source: params.source || undefined,
          p: params.page,
          page_size: pageSize,
        })
      ).data ?? { items: [], total: 0, page: params.page, page_size: pageSize },
    placeholderData: keepPreviousData,
  })
}
