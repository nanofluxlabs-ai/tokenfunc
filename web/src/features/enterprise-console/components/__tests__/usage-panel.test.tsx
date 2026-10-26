import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { UsageQuery } from '../../api'
import type { UsageGroupBy, UsageSummaryItem } from '../../types'
import { UsagePanel } from '../usage-panel'

// jsdom 下不渲染真实图表
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: false }),
}))

function item(name: string, quota: number, keyId = 0): UsageSummaryItem {
  return {
    key_id: keyId,
    key_name: name,
    request_count: 1,
    prompt_tokens: 100,
    completion_tokens: 50,
    cache_tokens: 25,
    cache_creation_tokens: 5,
    quota,
  }
}

// 各维度的固定返回：按日合计 400（两天各 200），模型 300 / 100
const ITEMS: Record<UsageGroupBy, UsageSummaryItem[]> = {
  day: [item('2026-10-25', 200), item('2026-10-26', 200)],
  model: [item('gpt-a', 300), item('gpt-b', 100)],
  team: [item('Research', 400, 6)],
  member: [item('Alice', 400, 8)],
  token: [item('alice-key', 400, 11)],
}

const fetchSummary = vi.fn(async (params: UsageQuery) => ({
  success: true,
  data: {
    from: params.from,
    to: params.to,
    group_by: params.group_by,
    items: ITEMS[params.group_by],
  },
}))

function requestedGroups(): UsageGroupBy[] {
  return fetchSummary.mock.calls.map((call) => call[0].group_by)
}

function renderPanel(props: Partial<Parameters<typeof UsagePanel>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <UsagePanel
        queryKey={['enterprise-test']}
        fetchSummary={fetchSummary}
        exportUrl='/export'
        {...props}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 26, 10, 0, 0))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('UsagePanel', () => {
  test('defaults to month to date and issues one query per section', async () => {
    renderPanel()

    expect(await screen.findByText('gpt-a')).toBeInTheDocument()
    expect(fetchSummary).toHaveBeenCalledWith({
      group_by: 'day',
      from: '2026-10-01',
      to: '2026-10-26',
    })
    expect(requestedGroups().sort()).toEqual(['day', 'model', 'team'])
    expect(
      screen.getByRole('button', { name: 'Month to date' })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('deep-link range from the overview is used as-is', async () => {
    renderPanel({ initialRange: { from: '2026-10-26', to: '2026-10-26' } })

    expect(await screen.findByText('gpt-a')).toBeInTheDocument()
    for (const call of fetchSummary.mock.calls) {
      expect(call[0]).toMatchObject({ from: '2026-10-26', to: '2026-10-26' })
    }
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  test('quick range buttons refetch with the new range', async () => {
    renderPanel()
    await screen.findByText('gpt-a')
    fetchSummary.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }))

    expect(await screen.findByText('gpt-a')).toBeInTheDocument()
    expect(fetchSummary).toHaveBeenCalledWith({
      group_by: 'day',
      from: '2026-10-20',
      to: '2026-10-26',
    })
  })

  test('model share is computed against the range total from daily data', async () => {
    renderPanel()

    const modelSection = await screen.findByRole('region', { name: 'By model' })
    const row = (await within(modelSection).findByText('gpt-a')).closest('tr')
    expect(row).not.toBeNull()
    // 300 / 400
    expect(within(row as HTMLElement).getByText('75%')).toBeInTheDocument()
  })

  test('switching the attribution tab only refetches that dimension and keeps totals', async () => {
    renderPanel()
    expect(await screen.findByText('Research')).toBeInTheDocument()
    const totals = screen.getByRole('group', { name: 'Range totals' })
    expect(within(totals).getByText('$0.0008')).toBeInTheDocument()
    fetchSummary.mockClear()

    await userEvent.click(screen.getByRole('tab', { name: 'API Key' }))

    expect(await screen.findByText('alice-key')).toBeInTheDocument()
    expect(requestedGroups()).toEqual(['token'])
    expect(within(totals).getByText('$0.0008')).toBeInTheDocument()
  })

  test('team-scoped viewers get no team tab and start on members', async () => {
    renderPanel({ hideTeamDimension: true })

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Team' })).not.toBeInTheDocument()
    expect(requestedGroups()).not.toContain('team')
  })
})
