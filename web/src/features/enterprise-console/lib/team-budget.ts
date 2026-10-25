import type { Team } from '../types'

/** 团队已超预算且勾了「超限拦截」：该团队的 key 本月剩余时间被拒绝 */
export function isTeamBudgetBlocked(team: Team): boolean {
  return team.budget_state === 'exceeded' && team.budget_enforce
}
