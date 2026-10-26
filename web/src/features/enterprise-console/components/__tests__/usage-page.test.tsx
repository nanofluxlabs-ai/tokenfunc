import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { UsageQuery } from '../../api'
import type { EnterpriseActor } from '../../types'
import { EnterpriseUsage } from '../usage-page'

// jsdom 下不渲染真实图表
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: false }),
}))

// 路由 search 用可变对象模拟；navigate 只记录调用，由用例自己把 updater 作用到 search 上
const searchState: Record<string, unknown> = {}
const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => searchState,
    useNavigate: () => navigateMock,
  }),
  Link: (props: {
    to: string
    search?: Record<string, unknown>
    className?: string
    children?: ReactNode
  }) => {
    const query = new URLSearchParams(
      Object.entries(props.search ?? {})
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    ).toString()
    return (
      <a
        href={query ? `${props.to}?${query}` : props.to}
        className={props.className}
      >
        {props.children}
      </a>
    )
  },
}))

const apiMock = vi.hoisted(() => ({
  USAGE_EXPORT_URL: '/api/enterprise/usage/export',
  getUsageSummary: vi.fn(),
  downloadUsageCsv: vi.fn(),
  listMembers: vi.fn(),
  listTeams: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const owner: EnterpriseActor = {
  member_id: 0,
  role: 'enterprise_admin',
  team_id: 0,
  is_owner: true,
  provisioned: false,
}
vi.mock('../../hooks/use-enterprise-self', () => ({
  useEnterpriseSelf: () => ({
    data: { id: 1, name: 'Acme', actor: owner },
    isLoading: false,
  }),
}))

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <EnterpriseUsage />
    </QueryClientProvider>
  )
  return {
    rerender: () =>
      view.rerender(
        <QueryClientProvider client={client}>
          <EnterpriseUsage />
        </QueryClientProvider>
      ),
  }
}

/** 最近一次 navigate 把 search 改成什么 */
function lastNavigatedSearch(): Record<string, unknown> {
  const options = navigateMock.mock.lastCall?.[0] as {
    search: (prev: Record<string, unknown>) => Record<string, unknown>
  }
  return options.search({ ...searchState })
}

function requestedRanges(): string[] {
  return apiMock.getUsageSummary.mock.calls.map(
    (call) => `${(call[0] as UsageQuery).from}~${(call[0] as UsageQuery).to}`
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 26, 10, 0, 0))
  for (const key of Object.keys(searchState)) delete searchState[key]
  apiMock.getUsageSummary.mockImplementation(async (params: UsageQuery) => ({
    success: true,
    data: {
      from: params.from,
      to: params.to,
      group_by: params.group_by,
      items: [],
    },
  }))
  apiMock.listTeams.mockResolvedValue({
    success: true,
    data: [{ id: 6, name: 'Research' }],
  })
  apiMock.listMembers.mockResolvedValue({
    success: true,
    data: { items: [], total: 0 },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('EnterpriseUsage', () => {
  test('drill-down from the overview shows a link back to the overview', async () => {
    Object.assign(searchState, {
      from: '2026-10-26',
      to: '2026-10-26',
      source: 'overview',
    })
    renderPage()

    expect(
      await screen.findByRole('link', { name: 'Back to Enterprise Overview' })
    ).toHaveAttribute('href', '/enterprise/overview')
  })

  test('opening the report from the sidebar shows no back link', async () => {
    renderPage()

    await screen.findByRole('button', { name: 'Month to date' })
    expect(
      screen.queryByRole('link', { name: 'Back to Enterprise Overview' })
    ).not.toBeInTheDocument()
  })

  test('quick range writes from / to into the URL and keeps the drill-down source', async () => {
    Object.assign(searchState, { range: 'month', source: 'overview' })
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Last 7 days' })
    )

    expect(lastNavigatedSearch()).toEqual({
      from: '2026-10-20',
      to: '2026-10-26',
      range: undefined,
      source: 'overview',
    })
  })

  test('attribution tab writes group_by into the URL', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('tab', { name: 'API Key' }))

    expect(lastNavigatedSearch()).toEqual({ group_by: 'token' })
  })

  test('browser back to an earlier URL re-renders that range and tab without a reload', async () => {
    Object.assign(searchState, {
      from: '2026-10-20',
      to: '2026-10-26',
      group_by: 'token',
    })
    const view = renderPage()
    expect(
      await screen.findByRole('button', { name: 'Last 7 days' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('tab', { name: 'API Key' })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    // 后退：地址栏回到下钻时的「今天」+ 默认页签
    for (const key of Object.keys(searchState)) delete searchState[key]
    Object.assign(searchState, { from: '2026-10-26', to: '2026-10-26' })
    view.rerender()

    expect(
      await screen.findByRole('button', { name: 'Today' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(requestedRanges()).toContain('2026-10-26~2026-10-26')
  })

  test('clearing the team filter keeps the current range', async () => {
    Object.assign(searchState, {
      from: '2026-10-20',
      to: '2026-10-26',
      team_id: 6,
    })
    renderPage()

    expect(
      await screen.findByRole('link', { name: 'Clear filter' })
    ).toHaveAttribute('href', '/enterprise/usage?from=2026-10-20&to=2026-10-26')
  })
})
