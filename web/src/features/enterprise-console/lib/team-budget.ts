import type { Team } from '../types'

/** 预算进度需要的最小字段集：团队列表行与概览的团队预算项都满足 */
export type TeamBudgetView = Pick<
  Team,
  | 'monthly_budget_quota'
  | 'month_quota'
  | 'budget_percent'
  | 'budget_state'
  | 'budget_enforce'
>

/** 团队已超预算且勾了「超限拦截」：该团队的 key 本月剩余时间被拒绝 */
export function isTeamBudgetBlocked(team: TeamBudgetView): boolean {
  return team.budget_state === 'exceeded' && team.budget_enforce
}
