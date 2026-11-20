import {
  getCoreRowModel,
  useReactTable,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it } from 'vitest'

import { DataTableFacetedFilter } from '../faceted-filter'

const rows = [{ group: 'ent_std' }, { group: 'default' }]

function Fixture() {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const table = useReactTable({
    data: rows,
    columns: [{ accessorKey: 'group' }],
    getCoreRowModel: getCoreRowModel(),
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
  })
  return (
    <>
      <DataTableFacetedFilter
        column={table.getColumn('group')}
        title='User Group'
        options={[
          { value: 'ent_std', label: '企业标准' },
          { value: 'default', label: '默认' },
        ]}
        singleSelect
      />
      <output>{JSON.stringify(columnFilters)}</output>
    </>
  )
}

it('matches an option by its value when the label only shows the display name', async () => {
  const user = userEvent.setup()
  render(<Fixture />)

  await user.click(screen.getByRole('button', { name: /User Group/ }))
  await user.type(screen.getByPlaceholderText('User Group'), 'ent_std')

  expect(screen.getByRole('option', { name: /企业标准/ })).toBeVisible()
  expect(screen.queryByRole('option', { name: /默认/ })).not.toBeInTheDocument()

  await user.click(screen.getByRole('option', { name: /企业标准/ }))
  expect(screen.getByRole('status')).toHaveTextContent(
    '[{"id":"group","value":["ent_std"]}]'
  )
})

it('still matches an option by its display name', async () => {
  const user = userEvent.setup()
  render(<Fixture />)

  await user.click(screen.getByRole('button', { name: /User Group/ }))
  await user.type(screen.getByPlaceholderText('User Group'), '默认')

  expect(screen.getByRole('option', { name: /默认/ })).toBeVisible()
  expect(
    screen.queryByRole('option', { name: /企业标准/ })
  ).not.toBeInTheDocument()
})
