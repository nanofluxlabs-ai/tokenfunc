import type {
  ApiResponse,
  PagedData,
  UsagePeriod,
} from '@/features/finance/types'

export type { ApiResponse, PagedData }

export type TopupSource =
  | 'online'
  | 'redemption'
  | 'enterprise_topup'
  | 'subscription_balance'
  | 'admin_adjust'
  | 'refund'

export type TopupType = 'topup' | 'adjust' | 'refund' | 'subscription'

/** 一条钱包流水；quota 带符号，amount_usd 为带符号的 6 位小数字符串 */
export interface TopupEntry {
  id: string
  created_at: number
  type: TopupType
  source: TopupSource
  payment_method: string
  quota: number
  amount_usd: string
  ref_no: string
  content: string
}

export interface TopupSourceRow {
  type: TopupType
  source: TopupSource
  payment_method: string
  count: number
  quota: number
  amount_usd: string
  percentage: number
}

export interface TopupSummary {
  period: UsagePeriod
  total_entries: number
  total_quota: number
  total_amount_usd: string
  by_source: TopupSourceRow[]
}

export type ReconciliationTab = 'usage' | 'topup'
