import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import type { Bill } from '@/features/enterprise-console/types'

import { BillPaymentDialog } from '../bill-payment-dialog'

const apiMock = vi.hoisted(() => ({
  registerBillPayment: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 4,
    bill_no: 'TF-202611-000004',
    enterprise_id: 3,
    period_id: 2,
    bill_type: 'credit',
    period_start: 1_767_225_600,
    period_end: 1_769_904_000,
    amount_quota: 24_000,
    amount_usd: '0.048000000',
    adjustment_usd: '0',
    total_usd: '0.048000000',
    paid_usd: '0',
    currency: 'USD',
    status: 'unpaid',
    issued_at: 1_769_904_000,
    due_at: 1_769_904_000,
    paid_at: 0,
    reminder_count: 0,
    reconcile_diff_quota: 0,
    reconcile_acked_at: 0,
    reconcile_acked_by: 0,
    reconcile_ack_note: '',
    prompt_tokens: 0,
    completion_tokens: 0,
    remark: '',
    archive_info: null,
    archived_at: 0,
    usage_snapshot: null,
    seller_snapshot: null,
    buyer_snapshot: null,
    ...overrides,
  }
}

function renderDialog(bill: Bill | null) {
  const onSaved = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <BillPaymentDialog bill={bill} onOpenChange={onOpenChange} onSaved={onSaved} />
  )
  return { onSaved, onOpenChange }
}

afterEach(() => {
  cleanup()
  apiMock.registerBillPayment.mockReset()
})

test('a three-decimal outstanding bill prefills the exact amount and registers the full payment', async () => {
  // 24,000 quota = $0.048：展示与预填若四舍五入成 0.05 会被「不超过未付金额」校验拒掉
  apiMock.registerBillPayment.mockResolvedValue({ success: true, data: {} })
  renderDialog(makeBill())

  const amountInput = screen.getByLabelText('Amount (USD)')
  await waitFor(() => expect(amountInput).toHaveValue(0.048))

  await userEvent.click(
    screen.getByRole('button', { name: 'Register payment' })
  )

  await waitFor(() =>
    expect(apiMock.registerBillPayment).toHaveBeenCalledWith(4, {
      amount_usd: 0.048,
      reference: '',
      remark: '',
    })
  )
  expect(
    screen.queryByText('Payment exceeds the outstanding amount')
  ).not.toBeInTheDocument()
})

test('the description shows the outstanding amount with exact precision', async () => {
  renderDialog(makeBill())

  expect(await screen.findByText(/Outstanding: USD 0\.048$/)).toBeInTheDocument()
})

test('a round outstanding amount keeps two decimals and still submits', async () => {
  apiMock.registerBillPayment.mockResolvedValue({ success: true, data: {} })
  renderDialog(makeBill({ total_usd: '10', paid_usd: '4' }))

  expect(await screen.findByText(/Outstanding: USD 6\.00$/)).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Register payment' })
  )

  await waitFor(() =>
    expect(apiMock.registerBillPayment).toHaveBeenCalledWith(4, {
      amount_usd: 6,
      reference: '',
      remark: '',
    })
  )
})

test('an amount above the outstanding balance is rejected before the API call', async () => {
  renderDialog(makeBill())

  const amountInput = screen.getByLabelText('Amount (USD)')
  await waitFor(() => expect(amountInput).toHaveValue(0.048))
  await userEvent.clear(amountInput)
  await userEvent.type(amountInput, '0.049')
  await userEvent.click(
    screen.getByRole('button', { name: 'Register payment' })
  )

  expect(
    await screen.findByText('Payment exceeds the outstanding amount')
  ).toBeInTheDocument()
  expect(apiMock.registerBillPayment).not.toHaveBeenCalled()
})

test('a partial-payment remainder keeps its exact precision for the second payment', async () => {
  apiMock.registerBillPayment.mockResolvedValue({ success: true, data: {} })
  renderDialog(makeBill({ paid_usd: '0.02' }))

  const amountInput = screen.getByLabelText('Amount (USD)')
  await waitFor(() => expect(amountInput).toHaveValue(0.028))

  await userEvent.click(
    screen.getByRole('button', { name: 'Register payment' })
  )

  await waitFor(() =>
    expect(apiMock.registerBillPayment).toHaveBeenCalledWith(4, {
      amount_usd: 0.028,
      reference: '',
      remark: '',
    })
  )
})
