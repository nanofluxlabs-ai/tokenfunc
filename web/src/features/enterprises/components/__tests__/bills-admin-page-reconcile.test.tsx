import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import type { Bill } from '@/features/enterprise-console/types'

import { BillsAdminContent } from '../bills-admin-page'

const apiMock = vi.hoisted(() => ({
  listAdminBills: vi.fn(),
  voidBill: vi.fn(),
  registerBillPayment: vi.fn(),
  getSellerProfile: vi.fn(),
  updateSellerProfile: vi.fn(),
  ackReconcileAlert: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const diffBill: Bill = {
  id: 7,
  bill_no: 'TF-202610-000007',
  enterprise_id: 1,
  period_id: 1,
  bill_type: 'credit',
  period_start: 1_767_225_600,
  period_end: 1_769_904_000,
  amount_quota: 1_000_000,
  amount_usd: '2',
  adjustment_usd: '0',
  total_usd: '2',
  paid_usd: '0',
  currency: 'USD',
  status: 'unpaid',
  issued_at: 1_769_904_000,
  due_at: 0,
  paid_at: 0,
  reminder_count: 0,
  reconcile_diff_quota: 100,
  reconcile_acked_at: 0,
  reconcile_acked_by: 0,
  reconcile_ack_note: '',
  remark: '',
  archive_info: null,
  archived_at: 0,
  usage_snapshot: null,
  seller_snapshot: null,
  buyer_snapshot: { enterprise_name: 'Acme' },
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <BillsAdminContent />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  apiMock.listAdminBills.mockReset()
  apiMock.getSellerProfile.mockReset()
})

test('the reconciliation tab requests only bills with a difference and shows the diff badge', async () => {
  apiMock.getSellerProfile.mockResolvedValue({ success: true, data: {} })
  apiMock.listAdminBills.mockImplementation(
    async (params: { reconcile?: string }) => ({
      success: true,
      data: {
        items: params.reconcile === 'diff' ? [diffBill] : [],
        total: params.reconcile === 'diff' ? 1 : 0,
      },
    })
  )
  renderPage()
  await waitFor(() => expect(apiMock.listAdminBills).toHaveBeenCalled())
  expect(apiMock.listAdminBills).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'unpaid' })
  )

  await userEvent.click(
    screen.getByRole('tab', { name: 'Reconciliation diff' })
  )

  await waitFor(() =>
    expect(apiMock.listAdminBills).toHaveBeenLastCalledWith(
      expect.objectContaining({ reconcile: 'diff', p: 1 })
    )
  )
  expect(await screen.findByText(/^Diff /)).toBeInTheDocument()
})
