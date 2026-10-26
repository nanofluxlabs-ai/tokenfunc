import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { FinanceBillContext, UsageSource } from '../../../types'
import { BillDetailContent, type BillDetailScope } from '../bill-detail-content'
import { contextWith as billContextWith } from './fixtures'

const emptyPage = { items: [], total: 0, page: 1, page_size: 20 }
const apiMock = vi.hoisted(() => ({
  getUsageSummary: vi.fn(),
  getUsageDaily: vi.fn(),
  listUsageDetail: vi.fn(),
  downloadUsageExport: vi.fn(),
}))
vi.mock('../../../api', () => apiMock)
vi.mock('@/features/enterprise-console/api', () => ({
  downloadBillCsv: vi.fn(),
}))
vi.mock('@/features/enterprises/api', () => ({ ackReconcileAlert: vi.fn() }))

const ARCHIVE_BANNER =
  /row-level detail below is read from the statement snapshot archived on/
const PURGED_WARNING = /the breakdown below may be incomplete/

/** 已归档账单：archived_at 对应 2026-04-12 */
function contextWith(
  usageSource: UsageSource,
  logsPurged: boolean
): FinanceBillContext {
  return billContextWith({
    bill: { archived_at: 1_776_000_000, due_at: 0 },
    usage_source: usageSource,
    logs_purged: logsPurged,
  })
}

function renderContent(
  context: FinanceBillContext,
  scope: BillDetailScope = 'admin'
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <BillDetailContent context={context} scope={scope} />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  apiMock.listUsageDetail.mockReset()
  apiMock.getUsageSummary.mockReset()
  apiMock.getUsageDaily.mockReset()
})

function stubUsageApis() {
  apiMock.getUsageSummary.mockResolvedValue({ success: true, data: null })
  apiMock.getUsageDaily.mockResolvedValue({ success: true, data: null })
  apiMock.listUsageDetail.mockResolvedValue({ success: true, data: emptyPage })
}

test('usage_source=archive shows the frozen-statement banner with the archive date and no incomplete warning', () => {
  stubUsageApis()
  renderContent(contextWith('archive', true))
  expect(screen.getByText(ARCHIVE_BANNER)).toHaveTextContent('2026-04-12')
  expect(screen.queryByText(PURGED_WARNING)).not.toBeInTheDocument()
})

test('usage_source=archive_unavailable keeps the incomplete-breakdown warning', () => {
  stubUsageApis()
  renderContent(contextWith('archive_unavailable', true))
  expect(screen.getByText(PURGED_WARNING)).toBeInTheDocument()
  expect(screen.queryByText(ARCHIVE_BANNER)).not.toBeInTheDocument()
})

test('usage_source=live with logs intact shows neither banner and still queries usage with bill_id', async () => {
  stubUsageApis()
  renderContent(contextWith('live', false))
  expect(screen.queryByText(ARCHIVE_BANNER)).not.toBeInTheDocument()
  expect(screen.queryByText(PURGED_WARNING)).not.toBeInTheDocument()
  expect(await screen.findByText('No usage')).toBeInTheDocument()
  expect(apiMock.listUsageDetail).toHaveBeenCalledWith(
    expect.objectContaining({ scope: 'admin', user_id: 7, bill_id: 42 })
  )
})

test('scope=enterprise queries usage with the enterprise scope and bill_id but no user_id', async () => {
  stubUsageApis()
  renderContent(contextWith('live', false), 'enterprise')
  expect(await screen.findByText('No usage')).toBeInTheDocument()
  expect(apiMock.listUsageDetail).toHaveBeenCalledWith(
    expect.objectContaining({ scope: 'enterprise', bill_id: 42 })
  )
  expect(apiMock.listUsageDetail).not.toHaveBeenCalledWith(
    expect.objectContaining({ user_id: expect.anything() })
  )
})
