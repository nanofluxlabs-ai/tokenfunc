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

function makeItem(overrides: Partial<EnterpriseListItem>): EnterpriseListItem {
  return {
    id: 1,
    user_id: 2,
    name: 'Acme',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    billing_mode: 'prepaid',
    credit_cycle_type: '',
    credit_cycle_days: 0,
    credit_limit_quota: 0,
    payment_terms_days: 15,
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
    email: '',
    quota: 3_000_000,
    used_quota: 900_000,
    user_status: 1,
    period_limit_quota: 0,
    period_used_quota: 0,
    ...overrides,
  }
}

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

test('credit enterprise balance column shows remaining of the open period with its limit', () => {
  const item = makeItem({
    billing_mode: 'credit',
    period_limit_quota: 150_000_000,
    period_used_quota: 10_000_000,
  })
  render(<ColumnCell item={item} columnId='quota' />)

  expect(
    screen.getByText(formatQuotaWithCurrency(140_000_000))
  ).toBeInTheDocument()
  expect(
    screen.getByText(`Credit Limit ${formatQuotaWithCurrency(150_000_000)}`)
  ).toBeInTheDocument()
  expect(
    screen.queryByText(formatQuotaWithCurrency(3_000_000))
  ).not.toBeInTheDocument()
})

test('credit enterprise remaining is clamped to zero when period usage exceeds the limit', () => {
  const item = makeItem({
    billing_mode: 'credit',
    period_limit_quota: 1_000_000,
    period_used_quota: 1_500_000,
  })
  render(<ColumnCell item={item} columnId='quota' />)

  expect(screen.getByText(formatQuotaWithCurrency(0))).toBeInTheDocument()
})

test('credit enterprise used column shows the open period usage instead of lifetime usage', () => {
  const item = makeItem({
    billing_mode: 'credit',
    period_limit_quota: 150_000_000,
    period_used_quota: 10_000_000,
  })
  render(<ColumnCell item={item} columnId='used_quota' />)

  expect(
    screen.getByText(formatQuotaWithCurrency(10_000_000))
  ).toBeInTheDocument()
  expect(screen.getByText('Current period')).toBeInTheDocument()
  expect(
    screen.queryByText(formatQuotaWithCurrency(900_000))
  ).not.toBeInTheDocument()
})

test('prepaid enterprise keeps wallet balance and lifetime usage', () => {
  const item = makeItem({ billing_mode: 'prepaid' })
  const { unmount } = render(<ColumnCell item={item} columnId='quota' />)
  expect(
    screen.getByText(formatQuotaWithCurrency(3_000_000))
  ).toBeInTheDocument()
  expect(screen.queryByText(/Credit Limit/)).not.toBeInTheDocument()
  unmount()

  render(<ColumnCell item={item} columnId='used_quota' />)
  expect(screen.getByText(formatQuotaWithCurrency(900_000))).toBeInTheDocument()
  expect(screen.queryByText('Current period')).not.toBeInTheDocument()
})
