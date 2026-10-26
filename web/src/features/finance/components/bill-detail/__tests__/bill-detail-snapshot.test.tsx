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
      <BillDetailContent context={context} scope='enterprise' />
    </QueryClientProvider>
  )
}

describe('BillDetailContent usage snapshot', () => {
  test('v1 snapshot shows the legacy notice, a model table without prices, and - for missing cache columns', () => {
    renderContent(
      contextWith({
        bill: {
          usage_snapshot: {
            by_model: [
              {
                key_id: 0,
                key_name: 'gpt-4o',
                request_count: 3,
                prompt_tokens: 3000,
                completion_tokens: 1500,
                quota: 1_500_000,
              },
            ],
            by_department: [],
          },
        },
      })
    )
    expect(
      screen.getByText(/price and daily breakdowns are not available/)
    ).toBeInTheDocument()
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.queryByText('Input price')).not.toBeInTheDocument()
    expect(screen.queryByText('Summary by day')).not.toBeInTheDocument()
    const modelRow = screen.getByText('gpt-4o').closest('tr')
    expect(modelRow).not.toBeNull()
    expect(modelRow?.textContent).toContain('-')
  })

  test('v2 snapshot renders the token group table with unit price headers, the daily table and the team attribution', () => {
    renderContent(contextWith({ bill: { usage_snapshot: v2Snapshot } }))
    expect(screen.getByText('Summary by token group')).toBeInTheDocument()
    expect(screen.getByText('Input price')).toBeInTheDocument()
    expect(screen.getByText('Output price')).toBeInTheDocument()
    expect(screen.getByText('Summary by day')).toBeInTheDocument()
    expect(screen.getByText('2026-03-01')).toBeInTheDocument()
    expect(screen.getByText('R&D')).toBeInTheDocument()
    expect(
      screen.getByText(/usage snapshot frozen at issue time/)
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/may differ from the billed amount/)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/computed from current logs/)
    ).not.toBeInTheDocument()
  })

  test('v2 snapshot whose log total differs from the billed amount shows the in-flight notice', () => {
    renderContent(
      contextWith({
        bill: { amount_quota: 1_600_000, usage_snapshot: v2Snapshot },
      })
    )
    expect(
      screen.getByText(/may differ from the billed amount/)
    ).toBeInTheDocument()
  })

  test('v2 snapshot computed live by the backend shows the recomputed notice instead of the frozen one', () => {
    renderContent(
      contextWith({
        bill: { usage_snapshot: { ...v2Snapshot, snapshot_source: 'live' } },
      })
    )
    expect(
      screen.getByText(/the breakdown below is computed from current logs/)
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/usage snapshot frozen at issue time/)
    ).not.toBeInTheDocument()
    expect(screen.getByText('Summary by token group')).toBeInTheDocument()
  })
})
