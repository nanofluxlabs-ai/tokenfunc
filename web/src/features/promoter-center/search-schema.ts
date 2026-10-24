import z from 'zod'

import { dateParam, textParam } from '@/features/finance/search-schema'

/** /promoter-center 与 /promoters/$id/center 共用：日期区间 + 当前 tab */
export const promoterCenterSearchSchema = z.object({
  start: dateParam,
  end: dateParam,
  tab: textParam,
})

export type PromoterCenterSearch = z.infer<typeof promoterCenterSearchSchema>
