import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import type { Bill } from '@/features/enterprise-console/types'

import { AdjustmentDialog } from '../adjustment-dialog'

const apiMock = vi.hoisted(() => ({
  getEnterprise: vi.fn(),
  createEnterpriseAdjustment: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const verificationMock = vi.hoisted(() => ({
  requestVerification: vi.fn(),
}))
vi.mock('@/features/auth/secure-verification', () => ({
  useSecureVerification: () => ({
    requestVerification: verificationMock.requestVerification,
    isActive: false,
    dialogProps: {},
  }),
  SecureVerificationDialog: () => null,
}))

const enterprise = { id: 3, user_id: 42, name: 'Acme', billing_mode: 'prepaid' }

const bill: Bill = {
  id: 9,
  bill_no: 'TF-202610-000009',
  enterprise_id: 3,
  period_id: 1,
  bill_type: 'credit',
  period_start: 1_767_225_600,
  period_end: 1_769_904_000,
  amount_quota: 5_000_000,
  amount_usd: '10',
  adjustment_usd: '0',
  total_usd: '10',
  paid_usd: '4',
  currency: 'USD',
  status: 'partially_paid',
  issued_at: 1_769_904_000,
  due_at: 0,
  paid_at: 0,
  reminder_count: 0,
  reconcile_diff_quota: 0,
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

function renderDialog(props: { bill?: Bill | null } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onSaved = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <AdjustmentDialog
        open
        onOpenChange={onOpenChange}
        enterpriseId={3}
        bill={props.bill}
        balanceQuota={2_500_000}
        onSaved={onSaved}
      />
    </QueryClientProvider>
  )
  return { onSaved, onOpenChange }
}

async function fillAndSubmit(amount: string, remark: string) {
  await userEvent.clear(screen.getByLabelText('Adjustment amount (USD)'))
  await userEvent.type(screen.getByLabelText('Adjustment amount (USD)'), amount)
  await userEvent.clear(screen.getByLabelText('Remark (required)'))
  if (remark) {
    await userEvent.type(screen.getByLabelText('Remark (required)'), remark)
  }
  await userEvent.click(
    screen.getByRole('button', { name: 'Register adjustment' })
  )
}

afterEach(() => {
  cleanup()
  apiMock.getEnterprise.mockReset()
  apiMock.createEnterpriseAdjustment.mockReset()
  verificationMock.requestVerification.mockReset()
})

test('a remark shorter than 4 characters blocks the submit before any verification', async () => {
  apiMock.getEnterprise.mockResolvedValue({ success: true, data: enterprise })
  renderDialog()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Register adjustment' })
    ).toBeEnabled()
  )

  await fillAndSubmit('-2', 'abc')

  expect(
    await screen.findByText('Remark must be at least 4 characters')
  ).toBeInTheDocument()
  expect(verificationMock.requestVerification).not.toHaveBeenCalled()
  expect(apiMock.createEnterpriseAdjustment).not.toHaveBeenCalled()
})

test('a wallet adjustment asks for a proof bound to the owner and then posts it with the payload', async () => {
  apiMock.getEnterprise.mockResolvedValue({ success: true, data: enterprise })
  verificationMock.requestVerification.mockResolvedValue({
    proof_token: 'proof-1',
    method: 'password',
    scope: 'admin.user.manage',
    expires_at: 0,
  })
  apiMock.createEnterpriseAdjustment.mockResolvedValue({
    success: true,
    data: { kind: 'wallet', ledger: { id: 1 } },
  })
  const { onSaved, onOpenChange } = renderDialog()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Register adjustment' })
    ).toBeEnabled()
  )

  await fillAndSubmit('-2.5', 'duplicate charge refund')

  await waitFor(() =>
    expect(apiMock.createEnterpriseAdjustment).toHaveBeenCalledWith(
      3,
      {
        kind: 'wallet',
        bill_id: undefined,
        amount_usd: -2.5,
        remark: 'duplicate charge refund',
      },
      'proof-1'
    )
  )
  expect(verificationMock.requestVerification).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: 'admin.user.manage',
      context: { user_id: 42, action: 'enterprise_adjust' },
    })
  )
  expect(onSaved).toHaveBeenCalled()
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('a cancelled verification does not post anything', async () => {
  apiMock.getEnterprise.mockResolvedValue({ success: true, data: enterprise })
  verificationMock.requestVerification.mockResolvedValue(null)
  const { onSaved } = renderDialog()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Register adjustment' })
    ).toBeEnabled()
  )

  await fillAndSubmit('5', 'goodwill credit')

  await waitFor(() =>
    expect(verificationMock.requestVerification).toHaveBeenCalled()
  )
  expect(apiMock.createEnterpriseAdjustment).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

test('a bill adjustment shows the new total and refuses to go below the paid amount', async () => {
  apiMock.getEnterprise.mockResolvedValue({ success: true, data: enterprise })
  renderDialog({ bill })
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Register adjustment' })
    ).toBeEnabled()
  )
  expect(screen.getByText(/TF-202610-000009/)).toBeInTheDocument()

  await userEvent.clear(screen.getByLabelText('Adjustment amount (USD)'))
  await userEvent.type(screen.getByLabelText('Adjustment amount (USD)'), '-7')
  expect(screen.getByText('New total: USD 3.00')).toBeInTheDocument()

  await userEvent.type(
    screen.getByLabelText('Remark (required)'),
    'September double billing'
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Register adjustment' })
  )

  expect(
    await screen.findByText(
      'Adjusted total cannot be below the amount already paid'
    )
  ).toBeInTheDocument()
  expect(verificationMock.requestVerification).not.toHaveBeenCalled()
})
