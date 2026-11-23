import z from 'zod'

import {
  dateParam,
  pageParam,
  textParam,
} from '@/features/finance/search-schema'

/** /key-usage：只放筛选与分页，API key 绝不进 URL */
export const keyUsageSearchSchema = z.object({
  start: dateParam,
  end: dateParam,
  model: textParam,
  page: pageParam,
  pageSize: pageParam,
})

export type KeyUsageSearch = z.infer<typeof keyUsageSearchSchema>
