import z from 'zod'

import { pageParam, textParam } from '@/features/finance/search-schema'

/** 正整数 id；非法值按未提供处理 */
const idParam = z.number().int().positive().optional().catch(undefined)

/** /enterprise/keys 的 search：筛选进 URL，团队页 / 成员行可深链到某个成员的 key */
export const enterpriseKeysSearchSchema = z.object({
  team_id: idParam,
  member_id: idParam,
  q: textParam,
  page: pageParam,
})

export type EnterpriseKeysSearch = z.infer<typeof enterpriseKeysSearchSchema>
