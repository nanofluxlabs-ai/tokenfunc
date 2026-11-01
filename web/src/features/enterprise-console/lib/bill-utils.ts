import type { Bill } from '../types'

/** 未结清且已过到期日 */
export function isBillOverdue(bill: Bill, now = Date.now() / 1000): boolean {
  return (
    (bill.status === 'unpaid' || bill.status === 'partially_paid') &&
    bill.due_at > 0 &&
    bill.due_at <= now
  )
}

/**
 * 账单美元金额展示：后端金额是 6 位小数的 decimal，quota 折美元常出现 3 位以上小数，
 * 展示去掉多余尾零但至少保留 2 位（0.048 → "0.048"，6 → "6.00"）。
 * toFixed(6) 同时吸收浮点加减法噪声（如 0.048 - 0.02 的尾差）。
 */
export function formatBillUsd(amountUsd: number): string {
  return amountUsd.toFixed(6).replace(/(\.\d{2}\d*?)0+$/, '$1')
}
