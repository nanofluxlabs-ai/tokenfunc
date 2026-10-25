import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'

import { SettlementsTable } from '../components/settlements-table'
import type { PromoterSettlementMonth } from '../types'

const alice = {
  user_id: 41,
  username: 'alice',
  display_name: 'Alice',
  deleted: false,
  is_enterprise: false,
  net_quota: 500_000,
  has_credit: false,
  credit_paid_quota: 0,
  credit_unpaid_quota: 0,
}
const carol = {
  user_id: 42,
  username: 'carol',
  display_name: 'Carol',
  deleted: false,
  is_enterprise: true,
  net_quota: 250_000,
  has_credit: true,
  credit_paid_quota: 0,
  credit_unpaid_quota: 250_000,
}

const inProgress: PromoterSettlementMonth = {
  month: '2026-10',
  settleable: false,
  net_quota: 100_000,
  credit_paid_quota: 0,
  credit_unpaid_quota: 0,
  settled: false,
  users: [],
}
const pending: PromoterSettlementMonth = {
  month: '2026-09',
  settleable: true,
  net_quota: 750_000,
  credit_paid_quota: 0,
  credit_unpaid_quota: 250_000,
  settled: false,
  users: [alice, carol],
}
const settled: PromoterSettlementMonth = {
  month: '2026-08',
  settleable: true,
  net_quota: 900_000,
  credit_paid_quota: 900_000,
  credit_unpaid_quota: 0,
  settled: true,
  settlement: {
    id: 1,
    amount_usd: '61.5',
    remark: 'wired in October',
    settled_at: 1_760_000_000,
    reference: 'TX-1',
    settled_by: 1,
    settled_by_username: 'admin',
  },
  users: [alice],
}

afterEach(() => cleanup())

function findRowWithText(text: string): HTMLElement {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(text))
  if (!row) throw new Error(`row containing "${text}" not found`)
  return row
}

test('renders one status badge per month: in progress, pending and settled', () => {
  render(
    <SettlementsTable
      items={[inProgress, pending, settled]}
      showOperator={false}
      emptyTitle='empty'
    />
  )
  expect(screen.getByText('In progress')).toBeInTheDocument()
  expect(screen.getByText('Pending settlement')).toBeInTheDocument()
  expect(screen.getByText('Payout settled')).toBeInTheDocument()
  expect(screen.getByText('wired in October')).toBeInTheDocument()
})

test('expanding a month row lists its bound users with the credit split only for credit users', async () => {
  render(
    <SettlementsTable
      items={[pending]}
      showOperator={false}
      emptyTitle='empty'
    />
  )
  expect(screen.queryByText('alice')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Expand' }))
  const aliceRow = findRowWithText('alice')
  const carolRow = findRowWithText('carol')
  expect(within(carolRow).getByText('Enterprise')).toBeInTheDocument()
  // 预付用户没有授信桶，显示占位符
  expect(within(aliceRow).getByText('—')).toBeInTheDocument()
  // 回归：共享表格行是 memo 的，展开态变化后月份行的折叠按钮必须跟着刷新
  expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
    'aria-expanded',
    'true'
  )
})

test('hides the bank reference column from the promoter view and shows it to admins', () => {
  const { unmount } = render(
    <SettlementsTable
      items={[settled]}
      showOperator={false}
      emptyTitle='empty'
    />
  )
  expect(screen.queryByRole('columnheader', { name: 'Reference' })).toBeNull()
  expect(screen.queryByText('TX-1')).toBeNull()
  unmount()
  render(<SettlementsTable items={[settled]} showOperator emptyTitle='empty' />)
  expect(
    screen.getByRole('columnheader', { name: 'Reference' })
  ).toBeInTheDocument()
  expect(screen.getByText('TX-1')).toBeInTheDocument()
  expect(screen.getByText('admin')).toBeInTheDocument()
})

test('shows a placeholder when the settlement has no amount and the action buttons only with actions', () => {
  const noAmount: PromoterSettlementMonth = {
    ...settled,
    settlement: {
      id: 2,
      amount_usd: null,
      remark: '',
      settled_at: 1_760_000_000,
    },
  }
  render(
    <SettlementsTable
      items={[pending, noAmount]}
      showOperator
      actions={{ onMark: () => {}, onRevert: () => {} }}
      emptyTitle='empty'
    />
  )
  expect(
    screen.getByRole('button', { name: 'Mark as settled' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Revert settlement' })
  ).toBeInTheDocument()
  expect(
    within(findRowWithText('2026-08')).getAllByText('—').length
  ).toBeGreaterThan(0)
})

test('renders the empty title when there are no months', () => {
  render(
    <SettlementsTable
      items={[]}
      showOperator={false}
      emptyTitle='No months in the selected range'
    />
  )
  expect(
    screen.getByText('No months in the selected range')
  ).toBeInTheDocument()
})
