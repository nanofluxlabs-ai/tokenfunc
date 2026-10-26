import type {
  Bill,
  BillUsageSnapshotV2,
} from '@/features/enterprise-console/types'

import type { FinanceBillContext } from '../../../types'

/** 本地时区零点，避免测试机时区影响「账期结束日 = period_end - 1」的断言 */
export function localMidnight(
  year: number,
  month: number,
  day: number
): number {
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000)
}

export const PERIOD_START = localMidnight(2026, 3, 1)
/** 半开区间的结束时刻：展示的结束日应为前一天 2026-03-31 */
export const PERIOD_END = localMidnight(2026, 4, 1)

export const baseBill: Bill = {
  id: 42,
  bill_no: 'TF-202603-000042',
  enterprise_id: 1,
  period_id: 3,
  bill_type: 'credit',
  period_start: PERIOD_START,
  period_end: PERIOD_END,
  amount_quota: 1_500_000,
  amount_usd: '3',
  adjustment_usd: '0',
  total_usd: '3',
  paid_usd: '1',
  currency: 'USD',
  status: 'partially_paid',
  issued_at: PERIOD_END + 60,
  due_at: localMidnight(2026, 4, 15),
  paid_at: 0,
  reminder_count: 0,
  reconcile_diff_quota: 0,
  reconcile_acked_at: 0,
  reconcile_acked_by: 0,
  reconcile_ack_note: '',
  prompt_tokens: 0,
  completion_tokens: 0,
  archive_info: null,
  archived_at: 0,
  seller_snapshot: null,
  buyer_snapshot: null,
  remark: '',
  usage_snapshot: null,
}

export const v2Snapshot: BillUsageSnapshotV2 = {
  snapshot_version: 2,
  logs_total_calls: 3,
  logs_total_quota: 1_500_000,
  by_group_model: [
    {
      group: 'default',
      group_label: 'Default',
      model_name: 'claude-opus',
      count: 3,
      prompt_tokens: 3000,
      completion_tokens: 1500,
      input_tokens: 2000,
      cached_tokens: 800,
      cache_creation_tokens: 200,
      cache_creation_1h_tokens: 0,
      quota: 1_500_000,
      amount_usd: '3.000000',
      percentage: 100,
      ratios: {
        model_ratio: { value: 2.5 },
        group_ratio: { value: 1 },
        group_ratio_exclusive: false,
        completion_ratio: { value: 5 },
        cache_ratio: { value: 0.1 },
        cache_creation_ratio: { value: 1.25 },
        cache_creation_ratio_1h: null,
        model_price: null,
      },
      unit_prices: {
        input: 5,
        cache_read: 0.5,
        cache_write_5m: 6.25,
        cache_write_1h: null,
        output: 25,
      },
    },
  ],
  by_model: [],
  by_day: [
    {
      day: '2026-03-01',
      calls: 3,
      prompt_tokens: 3000,
      input_tokens: 2000,
      cached_tokens: 800,
      cache_creation_tokens: 200,
      completion_tokens: 1500,
      quota: 1_500_000,
      amount_usd: '3.000000',
      percentage: 100,
    },
  ],
  by_team: [
    {
      key_id: 1,
      key_name: 'R&D',
      request_count: 3,
      prompt_tokens: 3000,
      completion_tokens: 1500,
      cache_tokens: 800,
      cache_creation_tokens: 200,
      quota: 1_500_000,
    },
  ],
  by_member: [],
}

type ContextOverrides = {
  bill?: Partial<Bill>
  usage_source?: FinanceBillContext['usage_source']
  logs_purged?: boolean
  enterprise?: FinanceBillContext['enterprise']
}

/** 已出账账单的详情上下文（管理员 / 企业侧同构，企业侧 user 为 null） */
export function contextWith(
  overrides: ContextOverrides = {}
): FinanceBillContext {
  const bill: Bill = { ...baseBill, ...overrides.bill }
  return {
    kind: 'bill',
    summary: {
      kind: 'bill',
      id: bill.id,
      enterprise_id: bill.enterprise_id,
      enterprise_name: 'Archive Co',
      user_id: 7,
      username: 'archive-owner',
      bill_no: bill.bill_no,
      bill_type: bill.bill_type,
      period_no: 3,
      period_start: bill.period_start,
      period_end: bill.period_end,
      amount_quota: bill.amount_quota,
      total_usd: bill.total_usd,
      paid_usd: bill.paid_usd,
      status: bill.status,
      issued_at: bill.issued_at,
      due_at: bill.due_at,
      limit_quota: 0,
      used_quota: bill.amount_quota,
      token_usage: {
        prompt_tokens: bill.prompt_tokens,
        completion_tokens: bill.completion_tokens,
      },
    },
    enterprise: overrides.enterprise ?? null,
    user: null,
    bill,
    period: null,
    usage_ts_start: bill.period_start,
    usage_ts_end: bill.period_end - 1,
    logs_purged: overrides.logs_purged ?? false,
    usage_source: overrides.usage_source ?? 'live',
  }
}
