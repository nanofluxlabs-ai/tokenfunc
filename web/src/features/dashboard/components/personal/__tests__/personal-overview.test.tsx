import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { QuotaDataItem } from '../../../types'
import { PersonalOverview } from '../personal-overview'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; children?: ReactNode }) => (
    <a href={props.to}>{props.children}</a>
  ),
}))
// jsdom 下不渲染真实图表；趋势图换成只暴露天数与系列的占位，便于断言图表收到的数据
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@/components/charts/daily-trend-chart', () => ({
  DailyTrendChart: (props: {
    data: { day: string }[]
    series: { field: string }[]
  }) => (
    <div
      data-testid='trend-chart'
      data-days={props.data.length}
      data-series={props.series.map((serie) => serie.field).join(',')}
    />
  ),
}))
vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: false }),
}))

const apiMock = vi.hoisted(() => ({
  getUserQuotaDates: vi.fn(),
  getFlowQuotaDates: vi.fn(),
}))
vi.mock('../../../api', () => apiMock)

const selfMock = vi.hoisted(() => ({ getSelf: vi.fn() }))
vi.mock('@/lib/api', () => selfMock)

const statusState = vi.hoisted(() => ({
  status: { enable_data_export: true } as Record<string, unknown>,
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: statusState.status, loading: false }),
}))

const NOW = new Date('2026-10-27T10:20:00')

function hourRow(localTime: string, quota: number, count = 1): QuotaDataItem {
  return {
    created_at: new Date(localTime).getTime() / 1000,
    model_name: 'gpt-5',
    quota,
    count,
    token_used: 100,
  }
}

function renderOverview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PersonalOverview />
    </QueryClientProvider>
  )
}

/** 按 KPI 标题找到所在卡片 */
function kpiCard(title: string): HTMLElement {
  const card = screen.getByText(title).closest('.rounded-xl')
  if (!(card instanceof HTMLElement)) throw new Error(`card ${title} missing`)
  return card
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  statusState.status = { enable_data_export: true }
  selfMock.getSelf.mockResolvedValue({
    success: true,
    data: {
      id: 1,
      username: 'alice',
      role: 1,
      quota: 500_000,
      used_quota: 0,
      request_count: 0,
    },
  })
  apiMock.getFlowQuotaDates.mockResolvedValue({ success: true, data: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('PersonalOverview', () => {
  test('shows an empty state and skips usage requests when data export is off', async () => {
    statusState.status = { enable_data_export: false }

    renderOverview()

    expect(
      await screen.findByText('Usage statistics are turned off')
    ).toBeInTheDocument()
    expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument()
    expect(apiMock.getUserQuotaDates).not.toHaveBeenCalled()
    expect(apiMock.getFlowQuotaDates).not.toHaveBeenCalled()
  })

  test('shows the change badge only when yesterday has usage at the same time', async () => {
    apiMock.getUserQuotaDates.mockResolvedValue({
      success: true,
      data: [
        hourRow('2026-10-27T09:00:00', 300, 3),
        hourRow('2026-10-26T09:00:00', 200, 0),
      ],
    })

    renderOverview()

    const spendCard = kpiCard("Today's spend")
    expect(await within(spendCard).findByText('+50%')).toBeInTheDocument()
    expect(
      within(kpiCard('Requests today')).queryByText(/%$/)
    ).not.toBeInTheDocument()
  })

  test('switching the range to 30 days feeds 30 days into the trend chart', async () => {
    apiMock.getUserQuotaDates.mockResolvedValue({
      success: true,
      data: [hourRow('2026-10-27T09:00:00', 300)],
    })
    const user = userEvent.setup()

    renderOverview()

    const chart = await screen.findByTestId('trend-chart')
    expect(chart).toHaveAttribute('data-days', '7')

    await user.click(screen.getByRole('button', { name: 'Last 30 days' }))

    expect(await screen.findByTestId('trend-chart')).toHaveAttribute(
      'data-days',
      '30'
    )
  })
})
