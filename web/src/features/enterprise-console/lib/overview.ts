import type { OverviewTeamBudget, OverviewTodos, UsageDayItem } from '../types'

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

/** 概览快照：今日 / 昨日 / 近 7 天 / 前 7 天，全部从 overview.daily（截至今日、补零的 30 天）截取 */
export type OverviewDailySnapshot = {
  today: UsageDayItem
  yesterday: UsageDayItem
  last7: UsageDayItem[]
  last7Quota: number
  prev7Quota: number
}

const EMPTY_DAY: UsageDayItem = {
  day: '',
  quota: 0,
  request_count: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_tokens: 0,
}

export function buildOverviewDailySnapshot(
  daily: UsageDayItem[]
): OverviewDailySnapshot {
  const sumQuota = (rows: UsageDayItem[]) =>
    rows.reduce((total, row) => total + row.quota, 0)
  const last7 = daily.slice(-7)
  return {
    today: daily.at(-1) ?? EMPTY_DAY,
    yesterday: daily.at(-2) ?? EMPTY_DAY,
    last7,
    last7Quota: sumQuota(last7),
    prev7Quota: sumQuota(daily.slice(-14, -7)),
  }
}
