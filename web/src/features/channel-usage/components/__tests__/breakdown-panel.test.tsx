import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BreakdownEntry } from '../../hooks/use-channel-breakdowns'
import type {
  ChannelBreakdown,
  ChannelBreakdownPayer,
  ChannelUsageItem,
} from '../../types'
import { ChannelBreakdownPanel } from '../breakdown-panel'

const getChannelUsageBreakdownMock = vi.hoisted(() => vi.fn())
vi.mock('../../api', () => ({
  getChannelUsageBreakdown: getChannelUsageBreakdownMock,
}))

const amount = {
  call_count: 1,
  prompt_tokens: 10,
  completion_tokens: 5,
}

function payer(
  id: number,
  username: string,
  official: number,
  extra: Partial<ChannelBreakdownPayer> = {}
): ChannelBreakdownPayer {
  return {
    ...amount,
    payer_id: id,
    username,
    group: 'default',
    status: 1,
    is_enterprise: false,
    remain_quota: 5_000_000,
    has_subscription: false,
    avg_daily_consume: 0,
    official_quota: official,
    quota: official,
    ...extra,
  }
}

const channel = {
  id: 7,
  name: 'CRS Claude',
  range_official_quota: 1_500_000,
  range_call_count: 3,
} as ChannelUsageItem

const breakdown: ChannelBreakdown = {
  channel_id: 7,
  users: {
    items: [
      payer(31, 'acme_owner', 1_000_000, {
        is_enterprise: true,
        enterprise_name: 'Acme Inc',
      }),
      payer(0, '', 500_000),
    ],
    count: 2,
    others: { ...amount, official_quota: 0, quota: 0, call_count: 0 },
    others_count: 0,
    total: { ...amount, official_quota: 1_500_000, quota: 1_500_000 },
  },
  models: {
    items: [
      {
        ...amount,
        model_name: 'claude-opus-5',
        official_quota: 900_000,
        quota: 900_000,
      },
      {
        ...amount,
        model_name: 'claude-sonnet-5',
        official_quota: 600_000,
        quota: 600_000,
      },
    ],
    count: 2,
    others: { ...amount, official_quota: 0, quota: 0, call_count: 0 },
    others_count: 0,
    total: { ...amount, official_quota: 1_500_000, quota: 1_500_000 },
  },
}

function renderPanel(entry: BreakdownEntry, onRetry = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute()
  const page = createRoute({
    getParentRoute: () => root,
    path: '/channels/usage',
    component: () => (
      <ChannelBreakdownPanel
        channel={channel}
        entry={entry}
        range={{ start: '2026-03-12', end: '2026-03-12' }}
        rangeLabel='2026-03-12'
        metric='official'
        coverageStartTs={1_773_244_800}
        onRetry={onRetry}
      />
    ),
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/finance/users/$userId',
    component: () => <div>user detail</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([page, detail]),
    history: createMemoryHistory({ initialEntries: ['/channels/usage'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

beforeEach(() => {
  getChannelUsageBreakdownMock.mockResolvedValue({
    success: true,
    data: {
      range_start_ts: 0,
      range_end_ts: 0,
      metric: 'official',
      coverage_start_ts: 1_773_244_800,
      items: [
        {
          ...breakdown,
          users: {
            ...breakdown.users,
            items: [payer(31, 'acme_owner', 900_000)],
            count: 1,
          },
          models: {
            ...breakdown.models,
            items: [breakdown.models.items[0]],
            count: 1,
          },
        },
      ],
    },
  })
})

afterEach(() => {
  cleanup()
  getChannelUsageBreakdownMock.mockReset()
})

describe('channel breakdown panel', () => {
  it('shows a spinner while the entry is loading and a retry button when it failed', async () => {
    const onRetry = vi.fn()
    renderPanel({ loading: true, error: false, data: null })
    expect(await screen.findByRole('status')).toBeInTheDocument()
    cleanup()
    renderPanel({ loading: false, error: true, data: null }, onRetry)
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders payers and models with the enterprise name linked to the finance user detail', async () => {
    const router = renderPanel({
      loading: false,
      error: false,
      data: breakdown,
    })
    const link = await screen.findByRole('link', { name: 'Acme Inc' })
    expect(link).toHaveAttribute(
      'href',
      '/finance/users/31?start=2026-03-12&end=2026-03-12&username=acme_owner'
    )
    expect(screen.getByText('System requests')).toBeInTheDocument()
    expect(screen.getByText('claude-opus-5')).toBeInTheDocument()
    expect(screen.getByText('2 payers · 2 models')).toBeInTheDocument()
    // 明细合计等于渠道区间价值，不出现覆盖提示
    expect(screen.queryByText(/Breakdown covers/)).toBeNull()

    await userEvent.click(link)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/finance/users/31')
    )
  })

  it('cross-filters the other card when a model row is clicked and clears via the chip', async () => {
    renderPanel({ loading: false, error: false, data: breakdown })
    await userEvent.click(
      await screen.findByRole('button', { name: /claude-sonnet-5/ })
    )
    await waitFor(() =>
      expect(getChannelUsageBreakdownMock).toHaveBeenCalledWith({
        channel_ids: '7',
        start_date: '2026-03-12',
        end_date: '2026-03-12',
        metric: 'official',
        payer_id: undefined,
        model_name: 'claude-sonnet-5',
      })
    )
    // 用户卡切换为筛选结果（只剩 acme_owner），系统请求行消失；卡头出现可清除的筛选标签
    await waitFor(() =>
      expect(screen.queryByText('System requests')).toBeNull()
    )
    expect(
      screen.getByRole('button', { name: 'Clear filter' })
    ).toHaveTextContent('Only claude-sonnet-5')
    // 模型卡本身仍展示全部模型，且选中行有按下态
    expect(
      screen.getByRole('button', { name: /claude-sonnet-5/ })
    ).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(await screen.findByText('System requests')).toBeInTheDocument()
  })

  it('warns when the breakdown covers less than the channel range value', async () => {
    renderPanel({
      loading: false,
      error: false,
      data: {
        ...breakdown,
        users: {
          ...breakdown.users,
          total: { ...amount, official_quota: 500_000, quota: 500_000 },
        },
      },
    })
    expect(
      await screen.findByText(/Breakdown covers \$1 of the range value \$3/)
    ).toBeInTheDocument()
    expect(screen.getByText(/start from 2026-03-12/)).toBeInTheDocument()
  })
})
