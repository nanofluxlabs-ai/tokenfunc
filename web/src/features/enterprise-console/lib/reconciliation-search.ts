import z from 'zod'

import { dateParam, pageParam } from '@/features/finance/search-schema'

export const ENTERPRISE_RECONCILIATION_TABS = [
  'statements',
  'usage',
  'ledger',
] as const

export type EnterpriseReconciliationTab =
  (typeof ENTERPRISE_RECONCILIATION_TABS)[number]

/** /enterprise/bills 的 search：tab 与日期范围共享，page 属于当前 tab 的列表 */
export const enterpriseReconciliationSearchSchema = z.object({
  tab: z.enum(ENTERPRISE_RECONCILIATION_TABS).optional().catch(undefined),
  start: dateParam,
  end: dateParam,
  page: pageParam,
})

export type EnterpriseReconciliationSearch = z.infer<
  typeof enterpriseReconciliationSearchSchema
>
