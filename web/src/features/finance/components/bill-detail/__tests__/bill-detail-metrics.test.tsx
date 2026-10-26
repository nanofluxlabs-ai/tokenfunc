import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { FinanceBillContext } from '../../../types'
import { BillDetailContent } from '../bill-detail-content'
import { contextWith, v2Snapshot } from './fixtures'

vi.mock('../../../api', () => ({
  getUsageSummary: vi.fn().mockResolvedValue({ success: true, data: null }),
  getUsageDaily: vi.fn().mockResolvedValue({ success: true, data: null }),
  listUsageDetail: vi.fn().mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 20 },
  }),
  downloadUsageExport: vi.fn(),
}))
vi.mock('@/features/enterprise-console/api', () => ({
  downloadBillCsv: vi.fn(),
}))
vi.mock('@/features/enterprises/api', () => ({ ackReconcileAlert: vi.fn() }))

function renderContent(context: FinanceBillContext) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <BillDetailContent context={context} scope='admin' />
    </QueryClientProvider>
  )
}

describe('BillDetailContent summary cards', () => {
  test('credit bill shows the total with two decimals plus paid and outstanding amounts', () => {
    renderContent(
      contextWith({
        bill: {
          total_usd: '3.456789',
          paid_usd: '1.2',
          usage_snapshot: v2Snapshot,
        },
      })
    )
    expect(screen.getByText('Total amount')).toBeInTheDocument()
    expect(screen.getByText('USD 3.46')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('USD 1.20')).toBeInTheDocument()
    expect(screen.getByText('Outstanding: USD 2.26')).toBeInTheDocument()
    expect(screen.getByText('Issued')).toBeInTheDocument()
    expect(screen.getByText('Due: 2026-04-15')).toBeInTheDocument()
  })

  test('period card shows the last day of the half-open period, not period_end itself', () => {
    renderContent(contextWith({ bill: { usage_snapshot: v2Snapshot } }))
    expect(screen.getByText('2026-03-01 ~ 2026-03-31')).toBeInTheDocument()
    expect(
      screen.queryByText('2026-03-01 ~ 2026-04-01')
    ).not.toBeInTheDocument()
  })

  test('monthly statement shows the consumption label, no paid card, and the five balance columns', () => {
    renderContent(
      contextWith({
        bill: {
          bill_type: 'statement',
          total_usd: '2',
          usage_snapshot: {
            ...v2Snapshot,
            opening_quota: 5_000_000,
            topup_quota: 1_000_000,
            consumption_quota: 1_000_000,
            adjustment_quota: 0,
            closing_quota: 5_000_000,
          },
        },
      })
    )
    expect(screen.getAllByText('Consumption')).toHaveLength(2)
    expect(screen.queryByText('Total amount')).not.toBeInTheDocument()
    expect(screen.queryByText('Paid')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Due:/)).not.toBeInTheDocument()
    expect(screen.getByText('Monthly statement')).toBeInTheDocument()
    for (const label of [
      'Opening balance',
      'Top-ups',
      'Adjustments',
      'Closing balance',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
