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
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import type { User } from '../../types'
import { useUsersColumns } from '../users-columns'

// 用户列表：用户名、邮箱旁的一键复制

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

async function renderUsernameCell(user: User) {
  const rootRoute = createRootRoute({
    component: () => (
      <TooltipProvider>
        <ColumnCell user={user} columnId='username' />
      </TooltipProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()
}

const baseUser = {
  id: 7,
  username: 'alice',
  role: 1,
  status: 1,
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
} as User

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('clicking the copy button next to the username copies the username', async () => {
  await renderUsernameCell(baseUser)

  await userEvent.click(screen.getByRole('button', { name: 'Copy username' }))

  expect(writeText).toHaveBeenCalledWith('alice')
  expect(
    await screen.findByRole('button', { name: 'Copied' })
  ).toBeInTheDocument()
})

test('clicking the copy button next to the email copies the email', async () => {
  const user = { ...baseUser, id: 8, email: 'bob@example.com' } as User
  render(
    <TooltipProvider>
      <ColumnCell user={user} columnId='email' />
    </TooltipProvider>
  )

  await userEvent.click(screen.getByRole('button', { name: 'Copy email' }))

  expect(writeText).toHaveBeenCalledWith('bob@example.com')
})

test('email column without an email shows the placeholder and no copy button', () => {
  const user = { ...baseUser, id: 9, email: '' } as User
  render(
    <TooltipProvider>
      <ColumnCell user={user} columnId='email' />
    </TooltipProvider>
  )

  expect(screen.getByText('—')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Copy email' })
  ).not.toBeInTheDocument()
})
