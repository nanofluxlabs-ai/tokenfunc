import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import type { UsageRangeParams } from '../../types'
import {
  usageKey,
  usageScopeOf,
  usageScopeReady,
  useUsageDetail,
} from '../use-usage-breakdown-queries'

const apiMock = vi.hoisted(() => ({
  getUsageSummary: vi.fn(),
  getUsageDaily: vi.fn(),
  listUsageDetail: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const range = { ts_start: 1_772_985_600, ts_end: 1_773_158_399 }
const live: UsageRangeParams = { scope: 'admin', user_id: 7, ...range }
const archived: UsageRangeParams = { ...live, bill_id: 42 }

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  apiMock.listUsageDetail.mockReset()
})

test('the same admin subject and range with and without bill_id produce different query keys', () => {
  expect(usageKey('detail', archived)).not.toEqual(usageKey('detail', live))
  expect(usageKey('detail', archived)).toContain(42)
  expect(usageKey('detail', { scope: 'self', ...range })).toEqual([
    'admin-finance',
    'usage',
    'detail',
    'self',
    0,
    0,
    range.ts_start,
    range.ts_end,
  ])
})

test('useUsageDetail forwards bill_id to the detail API and keeps a separate cache entry per bill', async () => {
  apiMock.listUsageDetail.mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 20 },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const { result } = renderHook(
    () => useUsageDetail({ ...archived, page: 1, pageSize: 20 }),
    { wrapper: wrapper(client) }
  )
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(apiMock.listUsageDetail).toHaveBeenCalledWith(
    expect.objectContaining({ user_id: 7, bill_id: 42, p: 1, page_size: 20 })
  )
  const keys = client
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey)
  expect(keys).toHaveLength(1)
  expect(keys[0]).toContain(42)
})

test('an enterprise subject keys the cache by bill_id and is always ready to query', () => {
  const withBill = usageKey('detail', {
    scope: 'enterprise',
    bill_id: 42,
    ...range,
  })
  const withoutBill = usageKey('detail', { scope: 'enterprise', ...range })
  expect(withBill).not.toEqual(withoutBill)
  expect(withBill).toContain(42)
  expect(usageScopeReady({ scope: 'enterprise', ...range })).toBe(true)
  expect(usageScopeOf({ scope: 'enterprise', bill_id: 42, ...range })).toEqual({
    scope: 'enterprise',
    bill_id: 42,
  })
})
