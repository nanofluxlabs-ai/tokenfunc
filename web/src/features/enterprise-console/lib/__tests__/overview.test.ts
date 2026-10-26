import { describe, expect, test } from 'vitest'

import type {
  OverviewTeamBudget,
  OverviewTodos,
  UsageDayItem,
} from '../../types'
import {
  buildOverviewDailySnapshot,
  buildOverviewTodos,
  changePercent,
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

describe('changePercent', () => {
  test('returns the rounded change against the previous period', () => {
    expect(changePercent(1180, 1000)).toBe(18)
    expect(changePercent(900, 1000)).toBe(-10)
    expect(changePercent(1001, 3000)).toBe(-66.6)
  })

  test('returns null when there is no last-month baseline', () => {
    expect(changePercent(500, 0)).toBeNull()
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

function day(index: number, quota: number): UsageDayItem {
  return {
    day: `2026-10-${String(index).padStart(2, '0')}`,
    quota,
    request_count: quota / 10,
    prompt_tokens: quota * 2,
    completion_tokens: quota,
    cache_tokens: 0,
  }
}

describe('buildOverviewDailySnapshot', () => {
  test('slices today, yesterday and two 7-day windows from the 30-day series', () => {
    // 第 1..30 天，消耗 = 天数 × 10
    const daily = Array.from({ length: 30 }, (_, index) =>
      day(index + 1, (index + 1) * 10)
    )
    const snapshot = buildOverviewDailySnapshot(daily)
    expect(snapshot.today.day).toBe('2026-10-30')
    expect(snapshot.yesterday.day).toBe('2026-10-29')
    expect(snapshot.last7.map((item) => item.day)).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ])
    // 24..30 → (24+…+30)×10 = 1890；17..23 → 1400
    expect(snapshot.last7Quota).toBe(1890)
    expect(snapshot.prev7Quota).toBe(1400)
  })

  test('falls back to zero days when the series is empty', () => {
    const snapshot = buildOverviewDailySnapshot([])
    expect(snapshot.today.quota).toBe(0)
    expect(snapshot.today.day).toBe('')
    expect(snapshot.last7).toEqual([])
    expect(snapshot.prev7Quota).toBe(0)
  })
})
