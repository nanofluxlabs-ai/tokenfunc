import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { formatQuotaWithCurrency } from '@/lib/currency'

import type { EnterpriseListItem } from '../../types'
import { useEnterprisesColumns } from '../enterprises-columns'

// 取正午时刻避免测试机时区影响日期：2026-10-01 12:00Z 起，end_at 独占，减 1 秒落在 2026-10-31 12:00Z
const PERIOD_START = 1790856000
const PERIOD_END = 1793448001

function makeItem(overrides: Partial<EnterpriseListItem>): EnterpriseListItem {
  return {
    id: 1,
    user_id: 2,
    name: 'Acme',
    contact_name: '',
    contact_email: 'contact@acme.test',
    contact_phone: '',
    billing_mode: 'prepaid',
    credit_cycle_type: '',
    credit_cycle_days: 0,
    credit_limit_quota: 0,
    credit_auto_reset: false,
    credit_alert_percent: 80,
    payment_terms_days: 15,
    max_tokens: 0,
    currency: 'USD',
    billing_profile: {
      company_name: '',
      address: '',
      tax_id: '',
      billing_email: '',
      phone: '',
      country: '',
    },
    status: 'active',
    remark: '',
    created_at: 0,
    updated_at: 0,
    username: 'acme',
    display_name: 'acme',
    email: 'owner@acme.test',
    quota: 3_000_000,
    used_quota: 900_000,
    user_status: 1,
    period_limit_quota: 0,
    period_used_quota: 0,
    period_start_at: 0,
    period_end_at: 0,
    member_count: 0,
    login_count: 0,
    ...overrides,
  }
}

const creditItem = makeItem({
  billing_mode: 'credit',
  credit_cycle_type: 'natural_month',
  period_limit_quota: 150_000_000,
  period_used_quota: 10_000_000,
  period_start_at: PERIOD_START,
  period_end_at: PERIOD_END,
})

function ColumnCell(props: { item: EnterpriseListItem; columnId: string }) {
  const table = useReactTable({
    data: [props.item],
    columns: useEnterprisesColumns(),
    getCoreRowModel: getCoreRowModel(),
  })
  const cell = table
    .getRowModel()
    .rows[0]?.getAllCells()
    .find((item) => item.column.id === props.columnId)
  return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null
}

test('credit enterprise credit limit column shows remaining / limit with a progress bar', () => {
  render(<ColumnCell item={creditItem} columnId='credit_limit' />)

  expect(
    screen.getByText(
      `${formatQuotaWithCurrency(140_000_000)} / ${formatQuotaWithCurrency(150_000_000)}`
    )
  ).toBeInTheDocument()
  // 剩余 140 / 150 ≈ 93.33%
  expect(screen.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    String((140_000_000 / 150_000_000) * 100)
  )
})

test('credit enterprise remaining is clamped to zero when period usage exceeds the limit', () => {
  const item = makeItem({
    billing_mode: 'credit',
    period_limit_quota: 1_000_000,
    period_used_quota: 1_500_000,
  })
  render(<ColumnCell item={item} columnId='credit_limit' />)

  expect(
    screen.getByText(
      `${formatQuotaWithCurrency(0)} / ${formatQuotaWithCurrency(1_000_000)}`
    )
  ).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
})

test('credit enterprise leaves balance and used columns empty because the credit limit column covers them', () => {
  for (const columnId of ['quota', 'used_quota']) {
    const { unmount } = render(
      <ColumnCell item={creditItem} columnId={columnId} />
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(
      screen.queryByText(formatQuotaWithCurrency(3_000_000))
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(formatQuotaWithCurrency(900_000))
    ).not.toBeInTheDocument()
    unmount()
  }
})

test('credit enterprise shows the open period range and calendar month cycle', () => {
  const { unmount } = render(
    <ColumnCell item={creditItem} columnId='billing_cycle' />
  )
  expect(screen.getByText('2026-10-01 ~ 2026-10-31')).toBeInTheDocument()
  unmount()

  render(<ColumnCell item={creditItem} columnId='cycle_days' />)
  expect(screen.getByText('Calendar month')).toBeInTheDocument()
})

test('fixed-day credit cycle shows the configured day count', () => {
  const item = makeItem({
    billing_mode: 'credit',
    credit_cycle_type: 'fixed_days',
    credit_cycle_days: 45,
  })
  render(<ColumnCell item={item} columnId='cycle_days' />)
  expect(screen.getByText('45 days')).toBeInTheDocument()
})

test('quota based credit cycle shows "By quota" and an open-ended period range', () => {
  const item = makeItem({
    billing_mode: 'credit',
    credit_cycle_type: 'quota_based',
    period_start_at: PERIOD_START,
    period_end_at: 0,
  })
  const { unmount } = render(<ColumnCell item={item} columnId='cycle_days' />)
  expect(screen.getByText('By quota')).toBeInTheDocument()
  unmount()

  render(<ColumnCell item={item} columnId='billing_cycle' />)
  expect(screen.getByText('2026-10-01 ~ —')).toBeInTheDocument()
})

test('prepaid enterprise keeps wallet balance and leaves credit columns empty', () => {
  const item = makeItem({ billing_mode: 'prepaid' })
  for (const columnId of ['credit_limit', 'billing_cycle', 'cycle_days']) {
    const { unmount } = render(<ColumnCell item={item} columnId={columnId} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    unmount()
  }

  const { unmount } = render(<ColumnCell item={item} columnId='quota' />)
  expect(
    screen.getByText(formatQuotaWithCurrency(3_000_000))
  ).toBeInTheDocument()
  unmount()

  render(<ColumnCell item={item} columnId='used_quota' />)
  expect(screen.getByText(formatQuotaWithCurrency(900_000))).toBeInTheDocument()
})

test('owner account column links to the usage logs filtered by the owner username', async () => {
  const rootRoute = createRootRoute({
    component: () => <ColumnCell item={creditItem} columnId='username' />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()

  const link = await screen.findByRole('link', {
    name: 'View usage logs of acme',
  })
  expect(link).toHaveAttribute(
    'href',
    '/usage-logs/common?username=acme&page=1'
  )
})

test('email column shows the owner email with a copy button', () => {
  render(<ColumnCell item={creditItem} columnId='email' />)
  expect(screen.getByText('owner@acme.test')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Copy owner@acme.test' })
  ).toBeInTheDocument()
})

test('email column falls back to the enterprise contact email when the owner has none', () => {
  const item = makeItem({ email: '' })
  render(<ColumnCell item={item} columnId='email' />)
  expect(screen.getByText('contact@acme.test')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Copy contact@acme.test' })
  ).toBeInTheDocument()
})
