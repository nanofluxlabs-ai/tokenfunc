import { describe, expect, test } from 'vitest'

import type { OverviewTeamBudget, OverviewTodos } from '../../types'
import {
  buildOverviewTodos,
  monthOverMonthPercent,
  overviewTodoKey,
} from '../overview'

const emptyTodos: OverviewTodos = {
  unpaid_bills: 0,
  overdue_bills: 0,
  exhausted_keys: 0,
  expiring_keys: 0,
  credit_alert_hit: false,
  team_budget_warn: [],
  team_budget_exceeded: [],
}

function team(partial: Partial<OverviewTeamBudget>): OverviewTeamBudget {
  return {
    team_id: 1,
    team_name: 'Research',
    month_quota: 0,
    budget_quota: 1000,
    budget_percent: 0,
    budget_state: 'ok',
    budget_enforce: false,
    ...partial,
  }
}

describe('monthOverMonthPercent', () => {
  test('returns the rounded change against last month', () => {
    expect(monthOverMonthPercent(1180, 1000)).toBe(18)
    expect(monthOverMonthPercent(900, 1000)).toBe(-10)
    expect(monthOverMonthPercent(1001, 3000)).toBe(-66.6)
  })

  test('returns null when there is no last-month baseline', () => {
    expect(monthOverMonthPercent(500, 0)).toBeNull()
  })
})

describe('buildOverviewTodos', () => {
  test('returns an empty list when nothing needs attention', () => {
    expect(buildOverviewTodos(emptyTodos)).toEqual([])
  })

  test('orders items by severity and splits awaiting bills from overdue ones', () => {
    const warn = team({ team_id: 2, team_name: 'QA', budget_percent: 85 })
    const exceeded = team({
      team_id: 3,
      team_name: 'Ops',
      budget_percent: 120,
      budget_state: 'exceeded',
      budget_enforce: true,
    })
    const items = buildOverviewTodos({
      unpaid_bills: 3,
      overdue_bills: 1,
      exhausted_keys: 2,
      expiring_keys: 4,
      credit_alert_hit: true,
      team_budget_warn: [warn],
      team_budget_exceeded: [exceeded],
    })

    expect(items.map((item) => item.kind)).toEqual([
      'overdue_bills',
      'team_budget_exceeded',
      'credit_alert',
      'exhausted_keys',
      'team_budget_warn',
      'expiring_keys',
      'unpaid_bills',
    ])
    expect(items[0]).toEqual({ kind: 'overdue_bills', count: 1 })
    expect(items[6]).toEqual({ kind: 'unpaid_bills', count: 2 })
    expect(items.map(overviewTodoKey)).toEqual([
      'overdue_bills',
      'team_budget_exceeded-3',
      'credit_alert',
      'exhausted_keys',
      'team_budget_warn-2',
      'expiring_keys',
      'unpaid_bills',
    ])
  })
})
