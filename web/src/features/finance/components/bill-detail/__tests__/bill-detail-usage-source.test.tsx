import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { Bill } from '@/features/enterprise-console/types'

import type { FinanceBillContext, UsageSource } from '../../../types'
import { BillDetailContent } from '../bill-detail-page'

const emptyPage = { items: [], total: 0, page: 1, page_size: 20 }
const apiMock = vi.hoisted(() => ({
  getUsageSummary: vi.fn(),
  getUsageDaily: vi.fn(),
  listUsageDetail: vi.fn(),
  downloadUsageExport: vi.fn(),
}))
vi.mock('../../../api', () => apiMock)
vi.mock('@/features/enterprises/api', () => ({ ackReconcileAlert: vi.fn() }))

const ARCHIVE_BANNER =
  /row-level detail below is read from the statement snapshot archived on/
const PURGED_WARNING = /the breakdown below may be incomplete/

const bill: Bill = {
  id: 42,
  bill_no: 'TF-202603-000042',
  enterprise_id: 1,
  period_id: 1,
  bill_type: 'credit',
  period_start: 1_772_985_600,
  period_end: 1_773_158_400,
  amount_quota: 600,
  amount_usd: '0.0012',
  adjustment_usd: '0',
  total_usd: '0.0012',
  paid_usd: '0',
  currency: 'USD',
  status: 'unpaid',
  issued_at: 1_773_158_400,
  due_at: 0,
  paid_at: 0,
  reminder_count: 0,
  reconcile_diff_quota: 0,
  reconcile_acked_at: 0,
  reconcile_acked_by: 0,
  reconcile_ack_note: '',
  remark: '',
  archive_info: null,
  archived_at: 1_776_000_000,
  usage_snapshot: null,
  seller_snapshot: null,
  buyer_snapshot: null,
}

function contextWith(
  usageSource: UsageSource,
  logsPurged: boolean
): FinanceBillContext {
  return {
    kind: 'bill',
    summary: {
      kind: 'bill',
      id: bill.id,
      enterprise_id: 1,
      enterprise_name: 'Archive Co',
      user_id: 7,
      username: 'archive-owner',
      bill_no: bill.bill_no,
      bill_type: 'credit',
      period_no: 3,
      period_start: bill.period_start,
      period_end: bill.period_end,
      amount_quota: bill.amount_quota,
      total_usd: bill.total_usd,
      paid_usd: bill.paid_usd,
      status: bill.status,
      issued_at: bill.issued_at,
      due_at: 0,
      limit_quota: 0,
      used_quota: bill.amount_quota,
    },
    enterprise: null,
    user: null,
    bill,
    period: null,
    usage_ts_start: bill.period_start,
    usage_ts_end: bill.period_end - 1,
    logs_purged: logsPurged,
    usage_source: usageSource,
  }
}

function renderContent(context: FinanceBillContext) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <BillDetailContent context={context} />
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
    expect.objectContaining({ user_id: 7, bill_id: 42 })
  )
})
