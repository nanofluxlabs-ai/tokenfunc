import type { Bill } from '../types'

/** 未结清且已过到期日 */
export function isBillOverdue(bill: Bill, now = Date.now() / 1000): boolean {
  return (
    (bill.status === 'unpaid' || bill.status === 'partially_paid') &&
    bill.due_at > 0 &&
    bill.due_at <= now
  )
}
