import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { FinanceBillContext } from '../../../types'
import { BillDetailView } from '../bill-detail-view'
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

type ViewProps = Partial<React.ComponentProps<typeof BillDetailView>>

function renderView(props: ViewProps) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <BillDetailView
        scope='enterprise'
        context={null}
        isLoading={false}
        notFound={false}
        backLink={<a href='/enterprise/bills' />}
        {...props}
      />
    </QueryClientProvider>
  )
}

/** 有未核对对账差异的 credit 账单：管理员侧显示「标记已核对」，企业侧不显示 */
const diffContext: FinanceBillContext = contextWith({
  bill: { reconcile_diff_quota: 1000, usage_snapshot: v2Snapshot },
})

describe('BillDetailView', () => {
  test('enterprise scope renders invoice and CSV buttons but no archive control and no reconcile action', () => {
    renderView({ scope: 'enterprise', context: diffContext })
    expect(
      screen.getByRole('button', { name: 'Export invoice' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Export CSV' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Back to bills/ })
    ).toHaveAttribute('href', '/enterprise/bills')
    expect(
      screen.queryByRole('button', { name: /Archive to object storage/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Mark as reconciled' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('TF-202603-000042')).toBeInTheDocument()
    expect(screen.getByText('Archive Co')).toBeInTheDocument()
  })

  test('admin scope passes the context to adminActions and shows the reconcile action when a handler is given', () => {
    const onAckReconcile = vi.fn()
    renderView({
      scope: 'admin',
      context: diffContext,
      onAckReconcile,
      adminActions: (context) => (
        <button type='button'>archive {context.summary.bill_no}</button>
      ),
    })
    expect(
      screen.getByRole('button', { name: 'archive TF-202603-000042' })
    ).toBeInTheDocument()
    screen.getByRole('button', { name: 'Mark as reconciled' }).click()
    expect(onAckReconcile).toHaveBeenCalledTimes(1)
  })

  test('notFound shows the empty state with a generic title and no action buttons', () => {
    renderView({ notFound: true })
    expect(screen.getByText('Bill not found')).toBeInTheDocument()
    expect(screen.getByText('Bill')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Export CSV' })
    ).not.toBeInTheDocument()
  })

  test('loading without context renders the loading state instead of the empty state', () => {
    renderView({ isLoading: true })
    expect(screen.queryByText('Bill not found')).not.toBeInTheDocument()
    expect(screen.getByText('Bill')).toBeInTheDocument()
  })
})
