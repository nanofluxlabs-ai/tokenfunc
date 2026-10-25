import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import type { Bill } from '@/features/enterprise-console/types'

import { ReconcileAckDialog, ReconcileDiffAlert } from '../reconcile-diff-alert'

const apiMock = vi.hoisted(() => ({ ackReconcileAlert: vi.fn() }))
vi.mock('@/features/enterprises/api', () => apiMock)

const baseBill: Bill = {
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
  buyer_snapshot: null,
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  apiMock.ackReconcileAlert.mockReset()
})

test('a bill without difference renders no alert', () => {
  const { container } = render(
    <ReconcileDiffAlert
      bill={{ ...baseBill, reconcile_diff_quota: 0 }}
      onAck={() => {}}
    />
  )
  expect(container).toBeEmptyDOMElement()
})

test('a pending difference shows the alert and the mark button triggers onAck', async () => {
  const onAck = vi.fn()
  render(<ReconcileDiffAlert bill={baseBill} onAck={onAck} />)

  expect(screen.getByText('Reconciliation difference')).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Mark as reconciled' })
  )
  expect(onAck).toHaveBeenCalledTimes(1)
})

test('an acknowledged difference shows the reviewer and hides the mark button', () => {
  render(
    <ReconcileDiffAlert
      bill={{
        ...baseBill,
        reconcile_acked_at: 1_769_990_400,
        reconcile_acked_by: 9,
        reconcile_ack_note: 'checked against raw logs',
      }}
      onAck={() => {}}
    />
  )

  expect(
    screen.queryByRole('button', { name: 'Mark as reconciled' })
  ).not.toBeInTheDocument()
  expect(screen.getByText(/checked against raw logs/)).toBeInTheDocument()
})

test('confirming the dialog sends the note to the ack API', async () => {
  apiMock.ackReconcileAlert.mockResolvedValue({ success: true, data: baseBill })
  const onOpenChange = vi.fn()
  renderWithClient(
    <ReconcileAckDialog bill={baseBill} open onOpenChange={onOpenChange} />
  )

  await userEvent.type(
    screen.getByRole('textbox', { name: 'Note (optional)' }),
    'verified'
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Mark as reconciled' })
  )

  await waitFor(() =>
    expect(apiMock.ackReconcileAlert).toHaveBeenCalledWith(7, 'verified')
  )
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
})
