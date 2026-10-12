import type { ApiResponse } from '@/features/enterprise-console/types'
import type { FinanceCreditPeriodView } from '@/features/finance/types'

export type { ApiResponse }

/** 排名口径：official = 官方价值（与渠道行同口径），actual = 实际扣费（与余额同底数） */
export type ChannelUsageMetric = 'official' | 'actual'

export interface ChannelUsageItem {
  id: number
  name: string
  type: number
  status: number
  group: string
  tag: string
  priority: number
  weight: number
  response_time: number
  created_time: number
  remark: string
  total_quota: number
  total_official_quota: number
  total_prompt_tokens: number
  total_completion_tokens: number
  total_call_count: number
  range_quota: number
  range_official_quota: number
  range_prompt_tokens: number
  range_completion_tokens: number
  range_call_count: number
  month_quota: number
  month_official_quota: number
  month_prompt_tokens: number
  month_completion_tokens: number
  month_call_count: number
}

export interface ChannelUsageSummary {
  total_quota: number
  total_official_quota: number
  total_call_count: number
  total_prompt_tokens: number
  total_completion_tokens: number
  range_quota: number
  range_official_quota: number
  range_call_count: number
  range_prompt_tokens: number
  range_completion_tokens: number
  month_quota: number
  month_official_quota: number
  month_call_count: number
  month_prompt_tokens: number
  month_completion_tokens: number
  range_start_ts: number
  range_end_ts: number
  month_start_ts: number
}

export interface ChannelUsageStatsData {
  total: number
  page: number
  size: number
  items: ChannelUsageItem[]
  summary: ChannelUsageSummary
  available_types: number[]
  type_counts: Record<string, number>
}

export interface ChannelUsageStatsParams {
  start_date: string
  end_date: string
  page: number
  size: number
  sort: string
  order: 'asc' | 'desc'
  keyword?: string
  status?: string
  type?: string
}

export interface ChannelUsageAmount {
  official_quota: number
  quota: number
  call_count: number
  prompt_tokens: number
  completion_tokens: number
}

export interface ChannelBreakdownPayer extends ChannelUsageAmount {
  /** 0 = 系统请求（渠道测试等无用户归属的消费） */
  payer_id: number
  username: string
  group: string
  status: number
  is_enterprise: boolean
  enterprise_name?: string
  billing_mode?: 'prepaid' | 'credit'
  remain_quota: number
  credit_period?: FinanceCreditPeriodView
  has_subscription: boolean
  avg_daily_consume: number
}

export interface ChannelBreakdownModel extends ChannelUsageAmount {
  model_name: string
}

export interface ChannelBreakdownDimension<T> {
  items: T[]
  count: number
  others: ChannelUsageAmount
  others_count: number
  total: ChannelUsageAmount
}

export interface ChannelBreakdown {
  channel_id: number
  users: ChannelBreakdownDimension<ChannelBreakdownPayer>
  models: ChannelBreakdownDimension<ChannelBreakdownModel>
}

export interface ChannelBreakdownResult {
  range_start_ts: number
  range_end_ts: number
  metric: ChannelUsageMetric
  /** 明细表最早的数据日（零点时间戳），0 = 尚无数据 */
  coverage_start_ts: number
  items: ChannelBreakdown[]
}

export interface ChannelBreakdownParams {
  channel_ids: string
  start_date: string
  end_date: string
  metric: ChannelUsageMetric
  payer_id?: number
  model_name?: string
}

/** 面板内的交叉筛选：选中付款主体 → 模型卡只看它；选中模型 → 用户卡只看它 */
export type BreakdownSelection =
  | { type: 'payer'; key: number; label: string }
  | { type: 'model'; key: string; label: string }
