import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { DEFAULT_LOG_STATS } from '../../constants'
import type { LogStatistics } from '../../types'
import { CommonLogsStats } from '../common-logs-stats'
import { UsageLogsProvider } from '../usage-logs-provider'

function renderStats(stats: Partial<LogStatistics>) {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { ...DEFAULT_LOG_STATS, ...stats } },
  })
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const logs = createRoute({
    getParentRoute: () => auth,
    path: '/usage-logs/$section',
    component: () => (
      <UsageLogsProvider>
        <CommonLogsStats />
      </UsageLogsProvider>
    ),
    validateSearch: (search: Record<string, unknown>) => search,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([logs])]),
    history: createMemoryHistory({ initialEntries: ['/usage-logs/common'] }),
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
  vi.restoreAllMocks()
})

it('shows requests, cache hit and failure rate from the summary endpoint', async () => {
  renderStats({
    requests: 4,
    error_count: 1,
    input_tokens_total: 400,
    completion_tokens: 100,
    cache_read_tokens: 100,
    error_log_enabled: true,
  })
  expect(await screen.findByText('Requests')).toBeInTheDocument()
  expect(screen.getByText('4')).toBeInTheDocument()
  expect(screen.getByText('500 · Cache hit 25%')).toBeInTheDocument()
  expect(screen.getByText('Failure rate')).toBeInTheDocument()
  expect(screen.getByText('20%')).toBeInTheDocument()
  expect(api.get).toHaveBeenCalledWith(
    expect.stringMatching(/^\/api\/log\/self\/summary\?/)
  )
})

it('hides the failure rate when error logs are not recorded', async () => {
  renderStats({ requests: 4, error_log_enabled: false })
  expect(await screen.findByText('Requests')).toBeInTheDocument()
  expect(screen.queryByText('Failure rate')).not.toBeInTheDocument()
  expect(screen.getByText('Live RPM / TPM')).toBeInTheDocument()
})
