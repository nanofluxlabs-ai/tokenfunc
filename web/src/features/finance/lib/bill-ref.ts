import type { FinanceBillKind } from '../types'

export type BillRef = { kind: FinanceBillKind; id: number }

/** 路由参数 billId：已出账 bill-<id>，进行中账期 period-<id> */
export function formatBillRef(ref: BillRef): string {
  return `${ref.kind}-${ref.id}`
}

export function parseBillRef(value: string): BillRef | null {
  const match = /^(bill|period)-(\d+)$/.exec(value)
  if (!match) return null
  const id = Number(match[2])
  if (!Number.isInteger(id) || id <= 0) return null
  return { kind: match[1] as FinanceBillKind, id }
}

/** 账期天数：区间为半开 [start, end)，按整天四舍五入 */
export function periodDays(periodStart: number, periodEnd: number): number {
  if (periodEnd <= periodStart) return 0
  return Math.round((periodEnd - periodStart) / 86400)
}

/** 使用率百分比；没有授信额度时为 null */
export function creditUsagePercent(
  usedQuota: number,
  limitQuota: number
): number | null {
  if (limitQuota <= 0) return null
  return (usedQuota / limitQuota) * 100
}
