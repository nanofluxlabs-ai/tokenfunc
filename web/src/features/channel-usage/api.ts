import { api } from '@/lib/api'

import type {
  ApiResponse,
  ChannelBreakdownParams,
  ChannelBreakdownResult,
  ChannelUsageStatsData,
  ChannelUsageStatsParams,
} from './types'

const CHANNEL_USAGE_BASE = '/api/channel/usage_stats'

export async function getChannelUsageStats(
  params: ChannelUsageStatsParams
): Promise<ApiResponse<ChannelUsageStatsData>> {
  const res = await api.get(CHANNEL_USAGE_BASE, { params })
  return res.data
}

export async function getChannelUsageBreakdown(
  params: ChannelBreakdownParams
): Promise<ApiResponse<ChannelBreakdownResult>> {
  const res = await api.get(`${CHANNEL_USAGE_BASE}/breakdown`, { params })
  return res.data
}
