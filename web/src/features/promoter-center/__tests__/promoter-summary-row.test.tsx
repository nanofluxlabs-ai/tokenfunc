import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { PromoterSummaryRow } from '../components/promoter-summary-row'

function renderRow(selfData: unknown) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/promoter/self') {
      return { data: { success: true, data: selfData } }
    }
    return {
      data: {
        success: true,
        data: {
          promoter: selfData,
          range: {},
          summary: { bound_user_count: 12, net_quota: 2_500_000 },
          daily: [],
        },
      },
    }
  })
  const root = createRootRoute()
  const wallet = createRoute({
    getParentRoute: () => root,
    path: '/wallet',
    component: () => (
      <div>
        <span data-testid='upstream-card'>upstream</span>
        <PromoterSummaryRow />
      </div>
    ),
  })
  const center = createRoute({
    getParentRoute: () => root,
    path: '/promoter-center',
    component: () => <div>center</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([wallet, center]),
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
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

beforeEach(() => {
  useAuthStore.getState().auth.setUser({ id: 70, username: 'promo', role: 1 })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.setUser(null)
})

test('renders nothing for a user who is not a promoter', async () => {
  renderRow(null)
  await screen.findByTestId('upstream-card')
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith('/api/promoter/self')
  )
  expect(screen.queryByTestId('promoter-summary-row')).toBeNull()
})

test('shows bound users, month consumption and a link to the promoter center for a promoter', async () => {
  renderRow({ id: 7, user_id: 70, username: 'promo', aff_code: 'X' })
  const row = await screen.findByTestId('promoter-summary-row')
  await waitFor(() => expect(row).toHaveTextContent('12'))
  expect(
    screen.getByRole('link', { name: 'Open Promoter Center' })
  ).toHaveAttribute('href', '/promoter-center')
})
