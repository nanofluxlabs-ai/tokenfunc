import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { Bill } from '@/features/enterprise-console/types'

import type { FinanceBillSummary } from '../../../types'
import { BillsPanel } from '../bills-panel'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    params?: Record<string, string>
    children?: unknown
    className?: string
  }) => (
    <a
      href={Object.entries(props.params ?? {}).reduce(
        (href, [key, value]) => href.replace(`$${key}`, value),
        props.to
      )}
      className={props.className}
    >
      {props.children as never}
    </a>
  ),
}))

const apiMock = vi.hoisted(() => ({ listFinanceBills: vi.fn() }))
vi.mock('../../../api', () => apiMock)
// 收款 / 调账 / 开票方对话框属于企业管理模块，这里只验证列表与查询条
vi.mock('@/features/enterprises/api', () => ({ voidBill: vi.fn() }))
vi.mock('@/features/enterprises/components/bill-payment-dialog', () => ({
  BillPaymentDialog: () => null,
}))
vi.mock('@/features/enterprises/components/adjustment-dialog', () => ({
  AdjustmentDialog: () => null,
}))
vi.mock('@/features/enterprises/components/seller-profile-dialog', () => ({
  SellerProfileDialog: () => null,
}))

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
  prompt_tokens: 1_200_000,
  completion_tokens: 34_567,
  remark: '',
  archive_info: null,
  archived_at: 0,
  usage_snapshot: null,
  seller_snapshot: null,
  buyer_snapshot: { enterprise_name: 'Acme' },
}

const openPeriod: FinanceBillSummary = {
  kind: 'period',
  id: 3,
  enterprise_id: 1,
  enterprise_name: 'Acme',
  user_id: 2,
  username: 'acme',
  bill_no: '',
  bill_type: 'credit',
  period_no: 3,
  period_start: 1_769_904_000,
  period_end: 1_772_323_200,
  amount_quota: 500_000,
  total_usd: '1.000000',
  paid_usd: '0.000000',
  status: 'open',
  issued_at: 0,
  due_at: 0,
  limit_quota: 250_000_000,
  used_quota: 500_000,
  token_usage: { prompt_tokens: 9_000, completion_tokens: 1_000 },
}

const billRow: FinanceBillSummary = {
  ...openPeriod,
  kind: 'bill',
  id: diffBill.id,
  bill_no: diffBill.bill_no,
  period_no: 1,
  status: 'unpaid',
  bill: diffBill,
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <BillsPanel />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  apiMock.listFinanceBills.mockResolvedValue({
    success: true,
    data: { items: [openPeriod, billRow], total: 31, page: 1, page_size: 20 },
  })
})

afterEach(() => {
  cleanup()
  apiMock.listFinanceBills.mockReset()
})

test('lists open periods and issued bills in one table, each linking to its own detail', async () => {
  renderPanel()

  expect(
    await screen.findByRole('link', { name: 'Period #3' })
  ).toHaveAttribute('href', '/finance/bills/period-3')
  expect(
    screen.getByRole('link', { name: 'TF-202610-000007' })
  ).toHaveAttribute('href', '/finance/bills/bill-7')
  expect(screen.getByText('In progress')).toBeInTheDocument()
  // Token 消耗：账单行取冻结的两列，账期行取日聚合求和，合计换算单位保留 2 位
  expect(screen.getByText('1.23M')).toBeInTheDocument()
  expect(screen.getByText('10.00K')).toBeInTheDocument()
  expect(screen.getByText(/^Diff /)).toBeInTheDocument()
  expect(screen.getByText('Total: 31')).toBeInTheDocument()
  expect(apiMock.listFinanceBills).toHaveBeenLastCalledWith({
    include_open: 1,
    enterprise_name: undefined,
    bill_no: undefined,
    status: undefined,
    p: 1,
    page_size: 20,
  })
  // 账期行没有收款 / 作废等账单操作
  expect(
    screen.getAllByRole('button', { name: 'Register payment' })
  ).toHaveLength(1)
})

test('searching by enterprise name and bill number sends both filters and resets the page; Reset clears them', async () => {
  renderPanel()
  await screen.findByRole('link', { name: 'Period #3' })

  fireEvent.change(screen.getByRole('textbox', { name: 'Enterprise name' }), {
    target: { value: 'Acme' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Bill No.' }), {
    target: { value: 'TF-2026' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))

  await waitFor(() =>
    expect(apiMock.listFinanceBills).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enterprise_name: 'Acme',
        bill_no: 'TF-2026',
        p: 1,
      })
    )
  )

  fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
  await waitFor(() =>
    expect(apiMock.listFinanceBills).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enterprise_name: undefined,
        bill_no: undefined,
        status: undefined,
      })
    )
  )
  expect(screen.getByRole('textbox', { name: 'Enterprise name' })).toHaveValue(
    ''
  )
})

test('the status select offers all statuses first and is sent only after Search', async () => {
  renderPanel()
  await screen.findByRole('link', { name: 'Period #3' })

  const user = userEvent.setup()
  const select = screen.getByRole('combobox', { name: 'Filter by status' })
  expect(select).toHaveTextContent('All statuses')
  await user.click(select)
  await user.click(
    await screen.findByRole('option', { name: 'Reconciliation diff' })
  )
  expect(apiMock.listFinanceBills).toHaveBeenCalledTimes(1)

  await user.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(apiMock.listFinanceBills).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'reconcile', p: 1 })
    )
  )
})
