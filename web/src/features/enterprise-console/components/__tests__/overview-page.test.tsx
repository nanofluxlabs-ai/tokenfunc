import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { EnterpriseActor, EnterpriseOverview } from '../../types'
import { EnterpriseOverview as EnterpriseOverviewPage } from '../overview-page'

// 路由 Link 渲染成带 href 的 <a>，便于断言深链；search 直接拼成 query string
vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    search?: Record<string, unknown>
    className?: string
    children?: ReactNode
  }) => {
    const query = new URLSearchParams(
      Object.entries(props.search ?? {}).map(([key, value]) => [
        key,
        String(value),
      ])
    ).toString()
    return (
      <a href={query ? `${props.to}?${query}` : props.to}>{props.children}</a>
    )
  },
}))
// jsdom 下不渲染真实图表
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: false }),
}))

const apiMock = vi.hoisted(() => ({
  getEnterpriseOverview: vi.fn(),
  listLedger: vi.fn(),
  listCreditPeriods: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const actorState = vi.hoisted(() => ({ actor: null as EnterpriseActor | null }))
vi.mock('../../hooks/use-enterprise-self', () => ({
  useEnterpriseSelf: () => ({
    data: actorState.actor
      ? { id: 1, name: 'Acme', actor: actorState.actor }
      : null,
    isLoading: false,
  }),
}))

const owner: EnterpriseActor = {
  member_id: 0,
  role: 'enterprise_admin',
  team_id: 0,
  is_owner: true,
  provisioned: false,
}
const teamAdmin: EnterpriseActor = {
  member_id: 8,
  role: 'team_admin',
  team_id: 6,
  is_owner: false,
  provisioned: false,
}

function overview(partial: Partial<EnterpriseOverview>): EnterpriseOverview {
  return {
    enterprise: {
      id: 1,
      user_id: 10,
      name: 'Acme',
      billing_mode: 'credit',
      status: 'active',
      actor: owner,
      credit_cycle_type: 'natural_month',
      credit_cycle_days: 0,
      credit_limit_quota: 2_500_000,
      credit_auto_reset: false,
      credit_alert_percent: 80,
      payment_terms_days: 15,
    },
    balance_quota: 0,
    open_period: {
      id: 3,
      period_no: 3,
      start_at: 1_790_000_000,
      end_at: 1_792_000_000,
      limit_quota: 2_500_000,
      used_quota: 620_000,
      inflight_count: 0,
      status: 'open',
      closed_at: 0,
    },
    month: { quota: 620_000, prev_quota: 500_000 },
    keys: {
      total: 42,
      active: 37,
      disabled: 1,
      exhausted: 2,
      expired: 2,
      expiring_7d: 3,
    },
    org: { teams: 6, members: 42, login_members: 5 },
    daily: [{ day: '2026-10-26', quota: 1000, request_count: 1 }],
    todos: {
      unpaid_bills: 1,
      overdue_bills: 1,
      exhausted_keys: 2,
      expiring_keys: 3,
      credit_alert_hit: false,
      team_budget_warn: [],
      team_budget_exceeded: [
        {
          team_id: 6,
          team_name: 'Research',
          month_quota: 920_000,
          budget_quota: 1_000_000,
          budget_percent: 92,
          budget_state: 'exceeded',
          budget_enforce: true,
        },
      ],
    },
    team_budget: null,
    scope: null,
    ...partial,
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <EnterpriseOverviewPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  actorState.actor = owner
  apiMock.listLedger.mockResolvedValue({
    success: true,
    data: {
      items: [
        {
          id: 1,
          type: 'topup',
          amount_quota: 500_000,
          balance_after_quota: 500_000,
          ref_type: '',
          reference: '',
          remark: '',
          operator_id: 1,
          created_at: 1_791_000_000,
        },
      ],
      total: 1,
    },
  })
  apiMock.listCreditPeriods.mockResolvedValue({
    success: true,
    data: { items: [], total: 0 },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EnterpriseOverview', () => {
  test('credit owner sees the period card, prioritized to-dos with deep links and the collapsed finance sections', async () => {
    apiMock.getEnterpriseOverview.mockResolvedValue({
      success: true,
      data: overview({}),
    })
    renderPage()

    expect(await screen.findByText('Current period usage')).toBeInTheDocument()
    expect(screen.getByText('Spend this month')).toBeInTheDocument()
    expect(
      screen.getByText('+24% vs last month · Last month $1')
    ).toBeInTheDocument()
    expect(screen.getByText('Active keys')).toBeInTheDocument()
    expect(screen.getByText('Teams · Members')).toBeInTheDocument()

    const todos = within(screen.getByRole('region', { name: 'To-dos' }))
    const alerts = todos.getAllByRole('alert')
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      '1 bill(s) overdueView bills',
      'Research is over budget and blockedView team',
      '2 key(s) exhaustedView keys',
      '3 key(s) expire within 7 daysView keys',
    ])
    expect(todos.getByRole('link', { name: 'View bills' })).toHaveAttribute(
      'href',
      '/enterprise/bills'
    )
    expect(todos.getByRole('link', { name: 'View team' })).toHaveAttribute(
      'href',
      '/enterprise/teams?team_id=6'
    )
    const keyLinks = todos.getAllByRole('link', { name: 'View keys' })
    expect(keyLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/enterprise/keys?status=4',
      '/enterprise/keys?expiring=true',
    ])
    expect(
      screen.getByRole('link', { name: 'View usage report' })
    ).toHaveAttribute('href', '/enterprise/usage')
    expect(screen.getByRole('link', { name: 'API Keys' })).toHaveAttribute(
      'href',
      '/enterprise/keys'
    )

    // 财务区默认收起：触发器在，表格不在
    expect(
      screen.getByRole('button', { name: 'Credit Periods' })
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Ledger' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(apiMock.listCreditPeriods).not.toHaveBeenCalled()
  })

  test('prepaid owner sees the balance card with the last top-up and no credit periods section', async () => {
    apiMock.getEnterpriseOverview.mockResolvedValue({
      success: true,
      data: overview({
        enterprise: {
          ...overview({}).enterprise,
          billing_mode: 'prepaid',
        },
        balance_quota: 1_500_000,
        open_period: null,
        todos: {
          ...overview({}).todos,
          unpaid_bills: 0,
          overdue_bills: 0,
          exhausted_keys: 0,
          expiring_keys: 0,
          team_budget_exceeded: [],
        },
      }),
    })
    renderPage()

    expect(await screen.findByText('Balance')).toBeInTheDocument()
    expect(await screen.findByText(/^Last top-up /)).toBeInTheDocument()
    expect(screen.queryByText('Current period usage')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Credit Periods' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ledger' })).toBeInTheDocument()
    // 没有待办时整块不渲染
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'To-dos' })
    ).not.toBeInTheDocument()
  })

  test('team admin sees the team spend card scoped to their team and no finance sections', async () => {
    actorState.actor = teamAdmin
    apiMock.getEnterpriseOverview.mockResolvedValue({
      success: true,
      data: overview({
        open_period: null,
        month: { quota: 920_000, prev_quota: 0 },
        keys: {
          total: 4,
          active: 3,
          disabled: 0,
          exhausted: 1,
          expired: 0,
          expiring_7d: 0,
        },
        org: { teams: 1, members: 7, login_members: 2 },
        todos: {
          ...overview({}).todos,
          unpaid_bills: 0,
          overdue_bills: 0,
          exhausted_keys: 1,
          expiring_keys: 0,
        },
        team_budget: {
          team_id: 6,
          team_name: 'Research',
          month_quota: 920_000,
          budget_quota: 1_000_000,
          budget_percent: 92,
          budget_state: 'exceeded',
          budget_enforce: true,
        },
        scope: { team_id: 6, team_name: 'Research' },
      }),
    })
    renderPage()

    expect(await screen.findByText('Team spend this month')).toBeInTheDocument()
    expect(screen.getByText('Blocked by budget')).toBeInTheDocument()
    expect(screen.getByText('Research · Members')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Teams' })).toHaveAttribute(
      'href',
      '/enterprise/teams?team_id=6'
    )
    expect(
      screen.getByText('No keys expiring within 7 days')
    ).toBeInTheDocument()
    expect(screen.queryByText('Current period usage')).not.toBeInTheDocument()
    expect(screen.queryByText('Balance')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ledger' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Credit Periods' })
    ).not.toBeInTheDocument()
    expect(apiMock.listLedger).not.toHaveBeenCalled()
    // 只有本团队的 key 待办，没有账单待办
    const alerts = screen.getAllByRole('alert')
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      'Research is over budget and blockedView team',
      '1 key(s) exhaustedView keys',
    ])
  })
})
