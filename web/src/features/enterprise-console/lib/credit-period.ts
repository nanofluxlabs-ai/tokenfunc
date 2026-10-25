import type { CreditPeriod } from '../types'

type CreditPeriodRange = Pick<CreditPeriod, 'start_at' | 'end_at' | 'closed_at'>

/** 账期展示区间：额度信用期 end_at=0，已关闭的以 closed_at 为止，仍在进行的截止显示为 — */
export function formatCreditPeriodRange(
  period: CreditPeriodRange,
  format: (timestamp: number) => string
): string {
  const start = format(period.start_at)
  if (period.end_at > 0) return `${start} ~ ${format(period.end_at)}`
  if (period.closed_at > 0) return `${start} ~ ${format(period.closed_at)}`
  return `${start} ~ —`
}

type CreditState = {
  credit_cycle_type: string
  credit_auto_reset: boolean
}

/** 额度信用 auto_reset=false 用满出账后没有 open 期：等待收款或管理员手动开期 */
export function isCreditAwaitingPayment(
  enterprise: CreditState,
  hasOpenPeriod: boolean
): boolean {
  return (
    enterprise.credit_cycle_type === 'quota_based' &&
    !enterprise.credit_auto_reset &&
    !hasOpenPeriod
  )
}
