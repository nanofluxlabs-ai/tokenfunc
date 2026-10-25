import type { StatusBadgeProps } from '@/components/status-badge'

import type { EnterpriseBillingMode } from './types'

export const ENTERPRISE_BILLING_MODES: Record<
  EnterpriseBillingMode,
  { labelKey: string; variant: StatusBadgeProps['variant'] }
> = {
  prepaid: { labelKey: 'Prepaid', variant: 'info' },
  credit: { labelKey: 'Credit', variant: 'warning' },
}

export const DEFAULT_PAYMENT_TERMS_DAYS = 15

/** 管理员可为企业设置的 key 总数上限的硬上限（与后端 EnterpriseMaxTokensLimit 一致） */
export const MAX_ENTERPRISE_TOKENS = 10000

export const SUCCESS_MESSAGES = {
  ENTERPRISE_CREATED: 'Enterprise created successfully',
  ENTERPRISE_UPDATED: 'Enterprise updated successfully',
} as const

export const ERROR_MESSAGES = {
  LOAD_FAILED: 'Failed to load enterprises',
} as const
