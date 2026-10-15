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

import type { User } from '../../types'
import { useUsersColumns } from '../users-columns'

function UsernameCell(props: { user: User }) {
  const table = useReactTable({
    data: [props.user],
    columns: useUsersColumns(),
    getCoreRowModel: getCoreRowModel(),
  })
  const cell = table
    .getRowModel()
    .rows[0]?.getAllCells()
    .find((item) => item.column.id === 'username')
  return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null
}

test('username column links to the usage logs filtered by that username', async () => {
  const user = {
    id: 7,
    username: 'alice',
    display_name: 'Alice',
    role: 1,
    status: 1,
    quota: 0,
    used_quota: 0,
    request_count: 0,
    group: 'default',
  } as User
  const rootRoute = createRootRoute({
    component: () => <UsernameCell user={user} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()

  const link = await screen.findByRole('link', {
    name: 'View usage logs of alice',
  })
  expect(link).toHaveTextContent('alice')
  expect(link).toHaveAttribute(
    'href',
    '/usage-logs/common?username=alice&page=1'
  )
  // 显示名仍作为副标题保留
  expect(screen.getByText('Alice')).toBeInTheDocument()
})
