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
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import {
  PromoterCenterPage,
  type PromoterCenterPageProps,
} from '../components/promoter-center-page'
import type { PromoterScope } from '../types'

// jsdom 下不渲染真实图表：VChart 的 ESM 入口在 vitest 里解析不了，图表行为由浏览器核对
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: false }),
}))

function overviewPayload(boundUserCount: number) {
  return {
    promoter: {
      id: 7,
      user_id: 70,
      username: 'promo',
      display_name: 'Promo',
      aff_code: 'PRM7',
      remark: '',
      share_rate: 12.5,
      created_at: 0,
    },
    range: { start: 0, end_excl: 0, start_day: '', end_day: '' },
    summary: {
      bound_user_count: boundUserCount,
      active_user_count: 1,
      consume_quota: 0,
      refund_quota: 0,
      net_quota: 0,
      request_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    daily: [],
  }
}

async function renderPage(scope: PromoterScope, boundUserCount = 2) {
  const getSpy = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.endsWith('/overview')) {
      return { data: { success: true, data: overviewPayload(boundUserCount) } }
    }
    if (url.endsWith('/users')) {
      return {
        data: {
          success: true,
          data: {
            range: {},
            items: [
              {
                user_id: 41,
                username: 'alice',
                display_name: 'Alice',
                is_enterprise: false,
                deleted: false,
                source: 'admin',
                bound_at: 1_700_000_000,
                usage_since: 0,
                net_quota: 500,
                request_count: 2,
                total_tokens: 30,
                last_consume_day: '2026-03-10',
              },
            ],
          },
        },
      }
    }
    if (url.includes('/users/41/usage')) {
      return {
        data: {
          success: true,
          data: {
            user: { user_id: 41, username: 'alice', usage_since: 0 },
            summary: { net_quota: 500, request_count: 2, total_tokens: 30 },
            daily: [],
            models: [],
          },
        },
      }
    }
    return { data: { success: true, data: { summary: {}, items: [] } } }
  })
  const root = createRootRoute()
  const page = createRoute({
    getParentRoute: () => root,
    path: '/center',
    validateSearch: (search: Record<string, unknown>) => search,
    component: function Page() {
      const search = page.useSearch()
      const navigate = page.useNavigate()
      return (
        <PromoterCenterPage
          scope={scope}
          search={search}
          // 测试路由的 search 未声明 schema，按页面 props 的宽类型传入
          navigate={navigate as unknown as PromoterCenterPageProps['navigate']}
        />
      )
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/center'] }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByText('Promoter Center')
  return { router, getSpy }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('admin scope reads the admin center endpoints for the given promoter', async () => {
  const { getSpy } = await renderPage({ scope: 'admin', promoterId: 7 })
  await waitFor(() =>
    expect(getSpy).toHaveBeenCalledWith(
      '/api/admin/promoter/promoters/7/center/overview',
      expect.anything()
    )
  )
  // 管理员视角标题带推广人用户名
  expect(await screen.findByText('promo')).toBeInTheDocument()
})

test('self scope reads the self center endpoints and exposes the referral link copy button', async () => {
  const { getSpy } = await renderPage({ scope: 'self' })
  await waitFor(() =>
    expect(getSpy).toHaveBeenCalledWith(
      '/api/promoter/center/overview',
      expect.anything()
    )
  )
  expect(
    await screen.findByRole('button', { name: 'Copy referral link' })
  ).toBeInTheDocument()
})

test('shows the share rate with the net-profit disclaimer when a rate is configured', async () => {
  await renderPage({ scope: 'self' })
  expect(await screen.findByText(/Share rate 12\.5%/)).toBeInTheDocument()
  expect(
    screen.getByText(
      /calculated on net profit after operating and resource costs/
    )
  ).toBeInTheDocument()
})

test('shows the empty state instead of tabs when the promoter has no bound users', async () => {
  await renderPage({ scope: 'self' }, 0)
  expect(await screen.findByText('No bound users yet')).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: 'User consumption' })).toBeNull()
})

test('switching tab writes the tab key to the URL search', async () => {
  const { router } = await renderPage({ scope: 'self' })
  await userEvent.click(
    await screen.findByRole('tab', { name: 'User consumption' })
  )
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({ tab: 'users' })
  )
})

test('the settlements tab writes tab=settlements to the URL and requests the settlements for the applied range', async () => {
  const { router, getSpy } = await renderPage({ scope: 'self' })
  await userEvent.click(await screen.findByRole('tab', { name: 'Settlements' }))
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({ tab: 'settlements' })
  )
  await waitFor(() =>
    expect(getSpy).toHaveBeenCalledWith(
      '/api/promoter/center/settlements',
      expect.objectContaining({
        params: expect.objectContaining({ start: expect.any(String) }),
      })
    )
  )
})

test('inspecting a bound user opens the usage sheet (regression: layout drops non-slot children)', async () => {
  await renderPage({ scope: 'self' })
  await userEvent.click(
    await screen.findByRole('tab', { name: 'User consumption' })
  )
  await userEvent.click(
    await screen.findByRole('button', { name: 'View details' })
  )
  const sheet = await screen.findByRole('dialog')
  expect(sheet).toHaveTextContent('alice')
  expect(sheet).toHaveTextContent('#41')
})
