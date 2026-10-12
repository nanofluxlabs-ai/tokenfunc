import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { DayRange } from '@/features/finance/lib/date-presets'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getChannelUsageBreakdown } from '../api'
import {
  BREAKDOWN_MAX_IDS_PER_REQUEST,
  CHANNEL_USAGE_QUERY_KEY,
} from '../constants'
import type {
  ChannelBreakdown,
  ChannelBreakdownResult,
  ChannelUsageMetric,
} from '../types'

export type BreakdownEntry = {
  loading: boolean
  error: boolean
  data: ChannelBreakdown | null
}

/**
 * 展开行的明细数据：当前展开的渠道 id 合成一次批量请求（「全部展开」= 当前页一次请求），
 * 区间 / 口径 / 展开集合变化时按 queryKey 重新拉取，切换期间沿用上一次数据避免闪烁。
 */
export function useChannelBreakdowns(params: {
  range: DayRange
  metric: ChannelUsageMetric
  expandedIds: number[]
}) {
  const sortedIds = useMemo(
    () => [...params.expandedIds].sort((a, b) => a - b),
    [params.expandedIds]
  )
  const idsKey = sortedIds.join(',')
  const query = useQuery({
    queryKey: [
      CHANNEL_USAGE_QUERY_KEY,
      'breakdown',
      params.range.start,
      params.range.end,
      params.metric,
      idsKey,
    ],
    queryFn: async () => {
      const results: ChannelBreakdownResult[] = []
      for (
        let i = 0;
        i < sortedIds.length;
        i += BREAKDOWN_MAX_IDS_PER_REQUEST
      ) {
        const chunk = sortedIds.slice(i, i + BREAKDOWN_MAX_IDS_PER_REQUEST)
        const data = requireServerSuccess(
          await getChannelUsageBreakdown({
            channel_ids: chunk.join(','),
            start_date: params.range.start,
            end_date: params.range.end,
            metric: params.metric,
          })
        ).data
        if (data) results.push(data)
      }
      return results
    },
    enabled: sortedIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  })

  const entries = useMemo(() => {
    const map = new Map<number, BreakdownEntry>()
    const byId = new Map<number, ChannelBreakdown>()
    for (const result of query.data ?? []) {
      for (const item of result.items) byId.set(item.channel_id, item)
    }
    for (const id of sortedIds) {
      const data = byId.get(id) ?? null
      map.set(id, {
        loading: query.isFetching && !data,
        error: query.isError && !data,
        data,
      })
    }
    return map
  }, [query.data, query.isFetching, query.isError, sortedIds])

  const coverageStartTs = query.data?.[0]?.coverage_start_ts ?? 0

  return { entries, coverageStartTs, refetch: query.refetch }
}

/** 单渠道交叉筛选：选中付款主体 / 模型后单独请求筛选后的另一维度 */
export function useFilteredBreakdown(params: {
  channelId: number
  range: DayRange
  metric: ChannelUsageMetric
  payerId?: number
  modelName?: string
}) {
  const enabled = Boolean(params.payerId || params.modelName)
  return useQuery({
    queryKey: [
      CHANNEL_USAGE_QUERY_KEY,
      'breakdown-filtered',
      params.channelId,
      params.range.start,
      params.range.end,
      params.metric,
      params.payerId ?? 0,
      params.modelName ?? '',
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getChannelUsageBreakdown({
          channel_ids: String(params.channelId),
          start_date: params.range.start,
          end_date: params.range.end,
          metric: params.metric,
          payer_id: params.payerId,
          model_name: params.modelName,
        })
      ).data?.items[0] ?? null,
    enabled,
    staleTime: 30 * 1000,
  })
}
