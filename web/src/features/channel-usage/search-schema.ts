import z from 'zod'

import { dateParam } from '@/features/finance/search-schema'

const textParam = z.string().optional().catch(undefined)
const pageParam = z.number().int().positive().optional().catch(undefined)

/**
 * /channels/usage 的 search：区间 / 分页 / 筛选 / 排序 / 口径 / 展开行全部进 URL，
 * 从财务中心用户详情返回时原样恢复。
 */
export const channelUsageSearchSchema = z.object({
  start: dateParam,
  end: dateParam,
  page: pageParam,
  size: pageParam,
  keyword: textParam,
  status: textParam,
  type: textParam,
  sort: textParam,
  order: z.enum(['asc', 'desc']).optional().catch(undefined),
  metric: z.enum(['official', 'actual']).optional().catch(undefined),
  /** 展开的渠道 id，逗号分隔；单个 id 会被路由解析成数字，这里统一回字符串 */
  expand: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .catch(undefined),
})

export type ChannelUsageSearch = z.infer<typeof channelUsageSearchSchema>
