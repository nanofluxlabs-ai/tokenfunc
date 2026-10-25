import z from 'zod'

import { pageParam, textParam } from '@/features/finance/search-schema'

/** 正整数 id；非法值按未提供处理 */
const idParam = z.number().int().positive().optional().catch(undefined)

/** /enterprise/keys 的 search：筛选进 URL，团队页 / 成员行可深链到某个成员的 key */
export const enterpriseKeysSearchSchema = z.object({
  team_id: idParam,
  member_id: idParam,
  /** 上游四态：1 启用 / 2 停用 / 3 过期 / 4 耗尽 */
  status: z.number().int().min(1).max(4).optional().catch(undefined),
  /** 只看 7 天内到期 */
  expiring: z.boolean().optional().catch(undefined),
  q: textParam,
  page: pageParam,
})

export type EnterpriseKeysSearch = z.infer<typeof enterpriseKeysSearchSchema>

/** /enterprise/teams 的 search：选中团队与成员表筛选 */
export const enterpriseTeamsSearchSchema = z.object({
  team_id: idParam,
  status: z.enum(['active', 'disabled']).optional().catch(undefined),
  /** true 只看可登录的成员，false 只看仅持 key 的成员 */
  login: z.boolean().optional().catch(undefined),
  q: textParam,
  page: pageParam,
})

export type EnterpriseTeamsSearch = z.infer<typeof enterpriseTeamsSearchSchema>

/** /enterprise/usage 的 search：维度与归属过滤（团队页 / 概览深链） */
export const enterpriseUsageSearchSchema = z.object({
  group_by: z
    .enum(['team', 'member', 'model', 'token', 'day'])
    .optional()
    .catch(undefined),
  team_id: idParam,
  member_id: idParam,
})

export type EnterpriseUsageSearch = z.infer<typeof enterpriseUsageSearchSchema>
