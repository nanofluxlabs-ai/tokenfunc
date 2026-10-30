/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { Table } from '@/components/ui/table'

import { DataTableHeader } from '../data-table-header'

type Row = { amount: number }

function Fixture(props: { columns: ColumnDef<Row, unknown>[] }) {
  const table = useReactTable({
    data: [{ amount: 1 }],
    columns: props.columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <Table>
      <DataTableHeader table={table} />
    </Table>
  )
}

it('renders a custom header function even when meta.label is set', () => {
  render(
    <Fixture
      columns={[
        {
          accessorKey: 'amount',
          header: () => <div data-testid='custom-header'>Amount</div>,
          meta: { label: 'Amount' },
        },
      ]}
    />
  )
  expect(screen.getByTestId('custom-header')).toHaveTextContent('Amount')
})

it('falls back to meta.label when the column has no header', () => {
  render(
    <Fixture
      columns={[{ accessorKey: 'amount', meta: { label: 'Amount label' } }]}
    />
  )
  expect(screen.getByRole('columnheader')).toHaveTextContent('Amount label')
})
