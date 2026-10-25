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

function ColumnCell(props: { user: User; columnId: string }) {
  const table = useReactTable({
    data: [props.user],
    columns: useUsersColumns(),
    getCoreRowModel: getCoreRowModel(),
  })
  const cell = table
    .getRowModel()
    .rows[0]?.getAllCells()
    .find((item) => item.column.id === props.columnId)
  return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null
}

function UsernameCell(props: { user: User }) {
  return <ColumnCell user={props.user} columnId='username' />
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

test('email column shows the email when the user has one', async () => {
  const user = {
    id: 8,
    username: 'bob',
    email: 'bob@example.com',
    role: 1,
    status: 1,
    quota: 0,
    used_quota: 0,
    request_count: 0,
    group: 'default',
  } as User
  render(<ColumnCell user={user} columnId='email' />)

  expect(screen.getByText('bob@example.com')).toBeInTheDocument()
})

test('email column shows a dash placeholder when the user has no email', async () => {
  const user = {
    id: 9,
    username: 'carol',
    email: '',
    role: 1,
    status: 1,
    quota: 0,
    used_quota: 0,
    request_count: 0,
    group: 'default',
  } as User
  render(<ColumnCell user={user} columnId='email' />)

  expect(screen.getByText('—')).toBeInTheDocument()
  expect(screen.queryByText(/@/)).not.toBeInTheDocument()
})
