import z from 'zod'

import {
  dateParam,
  pageParam,
  textParam,
} from '@/features/finance/search-schema'

/** /reconciliation 的 search：tab 与日期范围共享，page / source 只属于充值明细 */
export const reconciliationSearchSchema = z.object({
  tab: z.enum(['usage', 'topup']).optional().catch(undefined),
  start: dateParam,
  end: dateParam,
  page: pageParam,
  pageSize: pageParam,
  source: textParam,
})

export type ReconciliationSearch = z.infer<typeof reconciliationSearchSchema>
