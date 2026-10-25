import type { OverviewTeamBudget, OverviewTodos } from '../types'

/** 本月对上月的变化百分比（保留一位小数）；上月为 0 时无从比较返回 null */
export function monthOverMonthPercent(
  current: number,
  previous: number
): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/** 概览待办项：kind 决定文案、深链与严重程度 */
export type OverviewTodo =
  | { kind: 'overdue_bills'; count: number }
  | { kind: 'team_budget_exceeded'; team: OverviewTeamBudget }
  | { kind: 'credit_alert' }
  | { kind: 'exhausted_keys'; count: number }
  | { kind: 'team_budget_warn'; team: OverviewTeamBudget }
  | { kind: 'expiring_keys'; count: number }
  | { kind: 'unpaid_bills'; count: number }

/** 严重程度高的在前：逾期账单 > 超预算 > 授信预警 > 耗尽 key > 预算预警 > 即将过期 key > 未到期的待付账单；没有待办返回空数组 */
export function buildOverviewTodos(todos: OverviewTodos): OverviewTodo[] {
  const items: OverviewTodo[] = []
  if (todos.overdue_bills > 0) {
    items.push({ kind: 'overdue_bills', count: todos.overdue_bills })
  }
  for (const team of todos.team_budget_exceeded) {
    items.push({ kind: 'team_budget_exceeded', team })
  }
  if (todos.credit_alert_hit) {
    items.push({ kind: 'credit_alert' })
  }
  if (todos.exhausted_keys > 0) {
    items.push({ kind: 'exhausted_keys', count: todos.exhausted_keys })
  }
  for (const team of todos.team_budget_warn) {
    items.push({ kind: 'team_budget_warn', team })
  }
  if (todos.expiring_keys > 0) {
    items.push({ kind: 'expiring_keys', count: todos.expiring_keys })
  }
  const awaiting = todos.unpaid_bills - todos.overdue_bills
  if (awaiting > 0) {
    items.push({ kind: 'unpaid_bills', count: awaiting })
  }
  return items
}

/** 列表 key：团队类待办每个团队一条，其余每种一条 */
export function overviewTodoKey(todo: OverviewTodo): string {
  if ('team' in todo) return `${todo.kind}-${todo.team.team_id}`
  return todo.kind
}

/** 逾期账单与超预算是红色，其余黄色 */
export function isSevereTodo(todo: OverviewTodo): boolean {
  return todo.kind === 'overdue_bills' || todo.kind === 'team_budget_exceeded'
}
