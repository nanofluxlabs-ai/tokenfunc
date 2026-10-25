import type { ReconciliationTab, TopupSource, TopupType } from './types'

export const RECONCILIATION_QUERY_KEY = 'self-finance'

export const RECONCILIATION_TABS: ReconciliationTab[] = ['usage', 'topup']

export const RECONCILIATION_TAB_TITLE_KEYS: Record<ReconciliationTab, string> =
  {
    usage: 'Consumption statement',
    topup: 'Wallet statement',
  }

export const TOPUP_SOURCES: Record<TopupSource, { labelKey: string }> = {
  online: { labelKey: 'Online payment' },
  redemption: { labelKey: 'Redemption code' },
  enterprise_topup: { labelKey: 'Enterprise offline top-up' },
  enterprise_adjust: { labelKey: 'Enterprise balance adjustment' },
  subscription_balance: { labelKey: 'Subscription paid by balance' },
  admin_adjust: { labelKey: 'Admin adjustment' },
  refund: { labelKey: 'Refund' },
}

export const TOPUP_TYPES: Record<TopupType, { labelKey: string }> = {
  topup: { labelKey: 'Top-up' },
  adjust: { labelKey: 'Admin adjustment' },
  refund: { labelKey: 'Refund' },
  subscription: { labelKey: 'Subscription purchase' },
}
