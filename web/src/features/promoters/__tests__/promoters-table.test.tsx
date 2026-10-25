import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { PromotersProvider } from '../components/promoters-provider'
import { PromotersTable } from '../components/promoters-table'

const apiMock = vi.hoisted(() => ({ listPromoters: vi.fn() }))
vi.mock('../api', () => apiMock)

async function renderTable() {
  apiMock.listPromoters.mockResolvedValue({
    success: true,
    data: {
      page: 1,
      page_size: 20,
      total: 1,
      items: [
        {
          id: 3,
          user_id: 30,
          username: 'promo',
          display_name: 'Promo',
          aff_code: 'PRM',
          remark: 'offline channel',
          created_at: 1_700_000_000,
          email: 'promo@example.com',
          deleted: false,
          bound_user_count: 4,
          month_net_quota: 1_500_000,
        },
      ],
    },
  })
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const promoters = createRoute({
    getParentRoute: () => auth,
    path: '/promoters/',
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => (
      <PromotersProvider>
        <PromotersTable />
      </PromotersProvider>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([promoters])]),
    history: createMemoryHistory({ initialEntries: ['/promoters'] }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  apiMock.listPromoters.mockReset()
})

test('renders the toolbar search and the promoter rows with bound count and month consumption', async () => {
  await renderTable()
  // 显示名与邮箱拼在同一行：Promo · promo@example.com
  expect(await screen.findByText(/promo@example\.com/)).toBeInTheDocument()
  expect(
    screen.getByPlaceholderText('Search by username, ID, email or remark...')
  ).toBeInTheDocument()
  // 绑定数单元格与行操作都叫「管理绑定」，绑定数在前
  expect(
    screen.getAllByRole('button', { name: 'Manage bindings' })[0]
  ).toHaveTextContent('4')
  // 列头是「本月消耗」而不是上游的「This month」（中文译文「本月获得」会被当成收入）
  expect(
    screen.getByRole('columnheader', { name: 'Month consumption' })
  ).toBeInTheDocument()
  expect(screen.queryByText('This month')).toBeNull()
  expect(apiMock.listPromoters).toHaveBeenCalledWith({
    keyword: undefined,
    p: 1,
    page_size: 20,
  })
})
