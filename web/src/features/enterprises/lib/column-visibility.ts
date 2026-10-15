import type { VisibilityState } from '@tanstack/react-table'

import type { EnterpriseListItem } from '../types'

// 钱包口径的列只对预付企业有意义，账期口径的列只对授信企业有意义
export const PREPAID_ONLY_COLUMN_IDS = ['quota', 'used_quota'] as const
export const CREDIT_ONLY_COLUMN_IDS = [
  'credit_limit',
  'billing_cycle',
  'cycle_days',
] as const

/**
 * 按当前页的企业计费模式决定列显隐：页里没有预付企业就收起余额 / 已使用，没有授信企业就收起授信三列。
 * 列表为空（加载中或无数据）时全部保留，避免表头跳动。
 */
export function resolveBillingColumnVisibility(
  items: readonly Pick<EnterpriseListItem, 'billing_mode'>[]
): VisibilityState {
  if (items.length === 0) return {}
  const hasPrepaid = items.some((item) => item.billing_mode === 'prepaid')
  const hasCredit = items.some((item) => item.billing_mode === 'credit')
  const visibility: VisibilityState = {}
  for (const id of PREPAID_ONLY_COLUMN_IDS) visibility[id] = hasPrepaid
  for (const id of CREDIT_ONLY_COLUMN_IDS) visibility[id] = hasCredit
  return visibility
}
