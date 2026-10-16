import type { ApiResponse } from '@/features/enterprise-console/types'

export type { ApiResponse }

export type PagedData<T> = {
  page: number
  page_size: number
  total: number
  items: T[]
}

// ---------------------------------------------------------------------------
// 经营看板
// ---------------------------------------------------------------------------

export interface FinanceDailyStats {
  date?: string
  new_users: number
  new_paid_users: number
  paid_order_count: number
  paid_amount: number
  wallet_amount: number
  subscription_amount: number
  all_user_consume_quota: number
  paid_user_consume_quota: number
}

export type FinanceDisplayCurrency = 'USD' | 'CNY' | 'CUSTOM'

export interface FinanceOverview {
  start_date: string
  end_date: string
  display_currency: FinanceDisplayCurrency
  log_consume_enabled: boolean
  summary: FinanceDailyStats
  daily: FinanceDailyStats[]
}

// ---------------------------------------------------------------------------
// 订单中心
// ---------------------------------------------------------------------------

export type FinanceOrderType = 'wallet_topup' | 'subscription_purchase'
export type FinanceOrderStatus = 'success' | 'pending' | 'failed' | 'expired'

export interface FinanceOrder {
  id: string
  order_no: string
  user_id: number
  username: string
  order_type: FinanceOrderType
  trade_no: string
  payment_method: string
  payment_provider: string
  status: FinanceOrderStatus
  currency: string
  amount: number
  usd_amount: number
  credit_amount: number
  subject: string
  plan_id: number
  create_time: number
  complete_time: number
  /** 管理员手动充值登记的参考号 / 流水号 */
  reference: string
}

export interface ListFinanceOrdersParams {
  start_date: string
  end_date: string
  keyword?: string
  username?: string
  order_type?: string
  status?: string
  payment_method?: string
  p: number
  page_size: number
}

// ---------------------------------------------------------------------------
// 用户消耗
// ---------------------------------------------------------------------------

export interface FinanceCreditPeriodView {
  period_no: number
  limit_quota: number
  used_quota: number
  start_at: number
  end_at: number
  status: string
}

export interface FinanceUserConsumption {
  user_id: number
  username: string
  group: string
  status: number
  role: number
  remain_quota: number
  used_quota: number
  total_quota: number
  is_paid_user: boolean
  has_successful_order: boolean
  consume_quota: number
  refund_quota: number
  net_quota: number
  consume_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  last_consume_at: number
  text_input_tokens: number
  text_output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  audio_input_tokens: number
  audio_output_tokens: number
  wallet_consume_quota: number
  subscription_consume_quota: number
  current_subscription_id: number
  current_subscription_count: number
  current_subscription_plan_id: number
  current_subscription_plan_title: string
  current_subscription_amount_used: number
  current_subscription_amount_total: number
  current_subscription_source: string
  current_subscription_end_time: number
  is_enterprise: boolean
  enterprise_id?: number
  enterprise_name?: string
  billing_mode?: 'prepaid' | 'credit'
  credit_period?: FinanceCreditPeriodView
}

export interface ListUserConsumptionsParams {
  start_date: string
  end_date: string
  keyword?: string
  user_id?: number
  p: number
  page_size: number
}

// ---------------------------------------------------------------------------
// 模型消费
// ---------------------------------------------------------------------------

export interface FinanceModelConsumptionRow {
  model_name: string
  group: string
  group_label: string
  channel_id: number
  channel_name: string
  consume_quota: number
  refund_quota: number
  net_quota: number
  consume_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface FinanceModelConsumptionSummary {
  net_quota: number
  consume_quota: number
  refund_quota: number
  consume_count: number
  total_tokens: number
  row_count: number
  truncated: boolean
}

export interface ListModelConsumptionsParams {
  start_date: string
  end_date: string
  model_name?: string
  username?: string
  group?: string
}

// ---------------------------------------------------------------------------
// 用量明细（用户消耗详情 / 账单详情共用）
// ---------------------------------------------------------------------------

/** 用量接口的主体：管理员指定 user_id，个人财务对账只看本人 */
export type UsageScope = { scope: 'admin'; user_id: number } | { scope: 'self' }

export type UsageRangeParams = UsageScope & {
  ts_start: number
  ts_end: number
}

export interface FinanceRatioShare {
  value: number
  quota: number
}

export interface FinanceRatioValue {
  value: number
  shares?: FinanceRatioShare[]
}

export interface FinanceRatios {
  model_ratio: FinanceRatioValue | null
  group_ratio: FinanceRatioValue | null
  group_ratio_exclusive: boolean
  completion_ratio: FinanceRatioValue | null
  cache_ratio: FinanceRatioValue | null
  cache_creation_ratio: FinanceRatioValue | null
  cache_creation_ratio_1h: FinanceRatioValue | null
  model_price: FinanceRatioValue | null
}

export interface FinanceUnitPrices {
  input: number | null
  cache_read: number | null
  cache_write_5m: number | null
  cache_write_1h: number | null
  output: number | null
}

export interface UsageGroupModelRow {
  group: string
  group_label: string
  model_name: string
  count: number
  prompt_tokens: number
  completion_tokens: number
  input_tokens: number
  cached_tokens: number
  cache_creation_tokens: number
  cache_creation_1h_tokens: number
  quota: number
  amount_usd: string
  percentage: number
  ratios: FinanceRatios
  unit_prices: FinanceUnitPrices
}

export interface UsageModelRow {
  model_name: string
  calls: number
  prompt_tokens: number
  input_tokens: number
  cached_tokens: number
  cache_creation_tokens: number
  completion_tokens: number
  quota: number
  amount_usd: string
  percentage: number
}

export interface UsagePeriod {
  start: string
  end: string
  ts_start: number
  ts_end: number
}

export interface UsageSummary {
  period: UsagePeriod
  total_calls: number
  total_quota: number
  total_amount_usd: string
  by_model: UsageModelRow[]
  by_group_model: UsageGroupModelRow[]
}

export interface UsageDailyRow {
  day: string
  calls: number
  prompt_tokens: number
  input_tokens: number
  cached_tokens: number
  cache_creation_tokens: number
  completion_tokens: number
  quota: number
  amount_usd: string
  percentage: number
}

export interface UsageDaily {
  period: UsagePeriod
  total_calls: number
  total_quota: number
  total_amount_usd: string
  by_day: UsageDailyRow[]
}

export interface UsageDetailRow {
  created_at: number
  model_name: string
  token_name: string
  group: string
  prompt_tokens: number
  input_tokens: number
  cached_tokens: number
  cache_creation_tokens: number
  cache_creation_1h_tokens: number
  completion_tokens: number
  quota: number
  amount_usd: string
  unit_prices: FinanceUnitPrices
  model_ratio: number | null
  group_ratio: number | null
}

// ---------------------------------------------------------------------------
// 企业账单
// ---------------------------------------------------------------------------

export type FinanceBillKind = 'bill' | 'period'

export interface FinanceBillSummary {
  kind: FinanceBillKind
  id: number
  enterprise_id: number
  enterprise_name: string
  user_id: number
  username: string
  bill_no: string
  bill_type: 'credit' | 'statement'
  period_no: number
  period_start: number
  period_end: number
  amount_quota: number
  total_usd: string
  paid_usd: string
  status: string
  issued_at: number
  due_at: number
  limit_quota: number
  used_quota: number
}

export interface FinanceBillList extends PagedData<FinanceBillSummary> {
  open_periods: FinanceBillSummary[]
}

export interface FinanceBillContext {
  kind: FinanceBillKind
  summary: FinanceBillSummary
  enterprise: {
    id: number
    name: string
    billing_mode: 'prepaid' | 'credit'
    credit_cycle_type: string
    credit_cycle_days: number
    currency: string
  } | null
  user: {
    id: number
    username: string
    display_name: string
    email: string
  } | null
  bill: import('@/features/enterprise-console/types').Bill | null
  period: {
    id: number
    period_no: number
    start_at: number
    end_at: number
    limit_quota: number
    used_quota: number
    status: string
  } | null
  usage_ts_start: number
  usage_ts_end: number
}
