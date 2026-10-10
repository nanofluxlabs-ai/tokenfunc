import type { StatusBadgeProps } from '@/components/status-badge'

export const LEDGER_TYPES: Record<string, { labelKey: string }> = {
  topup: { labelKey: 'Top-up' },
  bill_issued: { labelKey: 'Bill issued' },
  bill_payment: { labelKey: 'Bill payment' },
  adjustment: { labelKey: 'Adjustment' },
  credit_limit_change: { labelKey: 'Credit configuration change' },
  cross_period_adjustment: { labelKey: 'Cross-period adjustment' },
}

export const CREDIT_PERIOD_STATUSES: Record<
  string,
  { labelKey: string; variant: StatusBadgeProps['variant'] }
> = {
  open: { labelKey: 'Open', variant: 'success' },
  closing: { labelKey: 'Closing', variant: 'warning' },
  billed: { labelKey: 'Billed', variant: 'neutral' },
}

export const BILL_STATUSES: Record<
  string,
  { labelKey: string; variant: StatusBadgeProps['variant'] }
> = {
  unpaid: { labelKey: 'Unpaid', variant: 'warning' },
  partially_paid: { labelKey: 'Partially paid', variant: 'info' },
  paid: { labelKey: 'Paid', variant: 'success' },
  void: { labelKey: 'Void', variant: 'neutral' },
}

export const BILL_TYPES: Record<string, { labelKey: string }> = {
  credit: { labelKey: 'Credit bill' },
  statement: { labelKey: 'Monthly statement' },
}
