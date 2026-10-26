import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    'aria-label'?: string
    children?: ReactNode
  }) => {
    const query = new URLSearchParams(
      Object.entries(props.search ?? {}).map(([key, value]) => [
        key,
        String(value),
      ])
    ).toString()
    return (
      <a
        href={query ? `${props.to}?${query}` : props.to}
        aria-label={props['aria-label']}
      >
        {props.children}
      </a>
    )
  },
}))
// jsdom 下不渲染真实图表；趋势图换成只暴露系列与天数的占位，便于断言图表收到的数据
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@/components/charts/daily-trend-chart', () => ({
  DailyTrendChart: (props: {
    data: { day: string }[]
    series: { field: string }[]
  }) => (
    <div
      data-testid='trend-chart'
      data-days={props.data.map((row) => row.day).join(',')}
      data-series={props.series.map((serie) => serie.field).join(',')}
    />
  ),
}))
vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: false }),
}))

const apiMock = vi.hoisted(() => ({
  getEnterpriseOverview: vi.fn(),
  listLedger: vi.fn(),
  listCreditPeriods: vi.fn(),
  getUsageSummary: vi.fn(),
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

// 9/27 ~ 10/26 共 30 天；最后两天：昨日 400、今日 500，前面每天 100
const thirtyDays = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 8, 27 + index))
  const quota = [100, 400, 500][Math.max(0, index - 27)]
  return {
    day: date.toISOString().slice(0, 10),
    quota,
    request_count: quota / 100,
    prompt_tokens: quota * 3,
    completion_tokens: quota,
    cache_tokens: 0,
  }
})

function modelItem(name: string, quota: number) {
  return {
    key_id: 0,
    key_name: name,
    request_count: 1,
    prompt_tokens: 10,
    completion_tokens: 5,
    cache_tokens: 0,
    cache_creation_tokens: 0,
    quota,
  }
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
    daily: thirtyDays,
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
  apiMock.getUsageSummary.mockResolvedValue({
    success: true,
    data: { from: '', to: '', group_by: 'model', items: [] },
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
  test('credit owner sees remaining credit, to-dos, today-based KPI cards and finance quick link', async () => {
    apiMock.getEnterpriseOverview.mockResolvedValue({
      success: true,
      data: overview({}),
    })
    renderPage()

    // 账户卡：剩余额度 = 2_500_000 - 620_000 → $3.76 / $5
    expect(await screen.findByText('Remaining credit')).toBeInTheDocument()
    expect(screen.getByText('$3.76')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'View reconciliation' })
    ).toHaveAttribute('href', '/enterprise/bills')
    // 本期已用与「本月消耗」口径重叠，概览不再有本月消耗卡
    expect(screen.queryByText('Spend this month')).not.toBeInTheDocument()

    const todos = within(screen.getByRole('region', { name: 'To-dos' }))
    expect(
      todos.getAllByRole('alert').map((alert) => alert.textContent)
    ).toEqual([
      '1 bill(s) overdueView bills',
      'Research is over budget and blockedView team',
      '2 key(s) exhaustedView keys',
      '3 key(s) expire within 7 daysView keys',
    ])

    // 快捷入口收纳原密钥 / 组织卡的计数，企业视角带财务对账
    expect(
      screen.getByText('37 / 42 active · 3 expiring within 7 days')
    ).toBeInTheDocument()
    expect(
      screen.getByText('6 teams · 42 members · 5 can sign in')
    ).toBeInTheDocument()
    expect(screen.getByText('1 bill(s) awaiting payment')).toBeInTheDocument()
    expect(apiMock.listLedger).not.toHaveBeenCalled()
  })

  test('KPI cards drill down to the usage report with the same server-side day range', async () => {
    apiMock.getEnterpriseOverview.mockResolvedValue({
      success: true,
      data: overview({}),
    })
    renderPage()

    const todaySpend = await screen.findByRole('link', {
      name: "Today's spend",
    })
    expect(todaySpend).toHaveAttribute(
      'href',
      '/enterprise/usage?from=2026-10-26&to=2026-10-26&source=overview'
    )
    expect(within(todaySpend).getByText('+25%')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Spend in the last 7 days' })
    ).toHaveAttribute(
      'href',
      '/enterprise/usage?from=2026-10-20&to=2026-10-26&source=overview'
    )
  })

  test('trend card plots only the last 7 days and switches series by metric', async () => {
    apiMock.getEnterpriseOverview.mockResolvedValue({
      success: true,
      data: overview({}),
    })
    renderPage()

    const chart = await screen.findByTestId('trend-chart')
    expect(chart.dataset.days?.split(',')).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ])
    expect(chart.dataset.series).toBe('quota')

    await userEvent.click(screen.getByRole('tab', { name: 'Tokens' }))
    expect(screen.getByTestId('trend-chart').dataset.series).toBe(
      'prompt_tokens,completion_tokens'
    )
    expect(
      screen.getByRole('link', { name: /View longer range/ })
    ).toHaveAttribute('href', '/enterprise/usage?source=overview')
  })

  test('today top models queries today by model and keeps the top 5 rows', async () => {
    apiMock.getEnterpriseOverview.mockResolvedValue({
      success: true,
      data: overview({}),
    })
    apiMock.getUsageSummary.mockResolvedValue({
      success: true,
      data: {
        from: '2026-10-26',
        to: '2026-10-26',
        group_by: 'model',
        items: [600, 500, 400, 300, 200, 100].map((quota, index) =>
          modelItem(`model-${index + 1}`, quota)
        ),
      },
    })
    renderPage()

    expect(await screen.findByText('model-1')).toBeInTheDocument()
    expect(apiMock.getUsageSummary).toHaveBeenCalledWith({
      group_by: 'model',
      from: '2026-10-26',
      to: '2026-10-26',
    })
    expect(screen.getByText('model-5')).toBeInTheDocument()
    expect(screen.queryByText('model-6')).not.toBeInTheDocument()
    // 占比分母是今日全部模型：600 / 2100
    expect(screen.getByText('28.6%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View all/ })).toHaveAttribute(
      'href',
      '/enterprise/usage?from=2026-10-26&to=2026-10-26&group_by=model&source=overview'
    )
  })

  test('today top models shows an empty state linking to the last 7 days', async () => {
    apiMock.getEnterpriseOverview.mockResolvedValue({
      success: true,
      data: overview({}),
    })
    renderPage()

    expect(await screen.findByText('No model calls today')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'View the last 7 days' })
    ).toHaveAttribute(
      'href',
      '/enterprise/usage?from=2026-10-20&to=2026-10-26&group_by=model&source=overview'
    )
  })

  test('prepaid owner sees the balance with the last top-up', async () => {
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
    expect(screen.queryByText('Remaining credit')).not.toBeInTheDocument()
    expect(
      screen.getByText('Bills, ledger and credit periods')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'To-dos' })
    ).not.toBeInTheDocument()
  })

  test('team admin sees the team budget and no finance entry points', async () => {
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
    expect(screen.getByText('3 / 4 active')).toBeInTheDocument()
    expect(screen.getByText('7 members · 2 can sign in')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Teams & members/ })
    ).toHaveAttribute('href', '/enterprise/teams?team_id=6')
    expect(screen.queryByText('Reconciliation')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'View reconciliation' })
    ).not.toBeInTheDocument()
    expect(apiMock.listLedger).not.toHaveBeenCalled()
  })
})
