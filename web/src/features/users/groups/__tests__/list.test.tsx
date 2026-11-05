import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { UserGroupItem } from '@/lib/tokenfunc-groups'

import {
  UserGroupsPanel,
  UserGroupsPrimaryButtons,
  UserGroupsProvider,
} from '..'

const apiMock = vi.hoisted(() => ({
  listUserGroups: vi.fn(),
  createUserGroup: vi.fn(),
  updateUserGroup: vi.fn(),
  deleteUserGroup: vi.fn(),
  reorderUserGroups: vi.fn(),
  getUserGroupPricing: vi.fn(),
  saveUserGroupPricing: vi.fn(),
}))
vi.mock('@/lib/tokenfunc-groups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tokenfunc-groups')>()),
  ...apiMock,
}))

function makeGroup(overrides: Partial<UserGroupItem>): UserGroupItem {
  return {
    key: 'vip',
    label: 'VIP',
    description: '',
    kind: 'individual',
    order: 0,
    user_count: 0,
    override_count: 0,
    ...overrides,
  }
}

const GROUPS: UserGroupItem[] = [
  makeGroup({
    key: 'default',
    label: 'Default',
    description: 'Fallback group',
    user_count: 3,
  }),
  makeGroup({ key: 'vip', label: 'VIP', user_count: 2, override_count: 1 }),
  makeGroup({
    key: 'ent_std',
    label: 'Enterprise standard',
    kind: 'enterprise',
    user_count: 0,
  }),
]

async function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // 用户数列是站内 Link，需要一个最小的内存路由
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <UserGroupsProvider>
          <UserGroupsPrimaryButtons />
          <UserGroupsPanel />
        </UserGroupsProvider>
      </QueryClientProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()
  await screen.findByText('Enterprise standard')
}

function rowOf(key: string): HTMLElement {
  const cell = screen.getByText(key)
  const row = cell.closest('tr')
  if (!row) throw new Error(`row ${key} not found`)
  return row
}

beforeEach(() => {
  apiMock.listUserGroups.mockResolvedValue({ success: true, data: GROUPS })
  apiMock.createUserGroup.mockResolvedValue({ success: true })
})

afterEach(() => {
  for (const mock of Object.values(apiMock)) mock.mockReset()
})

test('the default group has no delete button and a group with users has a disabled one', async () => {
  await renderPanel()

  expect(
    within(rowOf('default')).queryByRole('button', { name: 'Delete' })
  ).not.toBeInTheDocument()
  expect(
    within(rowOf('vip')).getByRole('button', { name: 'Delete' })
  ).toBeDisabled()
  expect(
    within(rowOf('ent_std')).getByRole('button', { name: 'Delete' })
  ).toBeEnabled()
})

test('the default row renders an invisible delete placeholder so every row has the same number of action slots', async () => {
  await renderPanel()

  const placeholder = within(rowOf('default')).getByTestId('delete-placeholder')
  expect(placeholder).toHaveAttribute('aria-hidden', 'true')
  expect(placeholder).toHaveClass('invisible')
  // 操作区 = 定价 / 编辑 / 删除（或占位）三格，列表不提供排序
  const actionsOf = (key: string) =>
    within(rowOf(key)).getByRole('button', { name: 'Pricing' })
      .parentElement as HTMLElement
  for (const key of ['default', 'vip', 'ent_std']) {
    expect(actionsOf(key).children).toHaveLength(3)
  }
  expect(
    screen.queryByRole('button', { name: /to reorder/ })
  ).not.toBeInTheDocument()
})

test('the pricing differences column shows the override count or a dash', async () => {
  await renderPanel()

  expect(within(rowOf('vip')).getByText('1')).toBeInTheDocument()
  // default 行有说明，所以唯一的破折号来自定价差异列
  expect(within(rowOf('default')).getByText('—')).toBeInTheDocument()
})

test('submitting the create drawer with an invalid key shows a validation error and does not call the API', async () => {
  await renderPanel()

  await userEvent.click(screen.getByRole('button', { name: 'Add user group' }))
  await userEvent.type(screen.getByLabelText('Group key'), 'Bad Key')
  await userEvent.type(screen.getByLabelText('Name'), 'Bad')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

  expect(
    await screen.findByText(
      'Only lowercase letters, digits, hyphens and underscores, up to 64 characters, starting with a letter or digit'
    )
  ).toBeInTheDocument()
  expect(apiMock.createUserGroup).not.toHaveBeenCalled()
})

test('submitting the create drawer with valid data calls createUserGroup with the form values', async () => {
  await renderPanel()

  await userEvent.click(screen.getByRole('button', { name: 'Add user group' }))
  await userEvent.type(screen.getByLabelText('Group key'), 'ent_pro')
  await userEvent.type(screen.getByLabelText('Name'), 'Enterprise pro')
  await userEvent.type(screen.getByLabelText('Description'), 'Top tier')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

  await waitFor(() =>
    expect(apiMock.createUserGroup).toHaveBeenCalledWith({
      key: 'ent_pro',
      label: 'Enterprise pro',
      kind: 'individual',
      description: 'Top tier',
    })
  )
})

test('the key field is read-only when editing an existing group', async () => {
  await renderPanel()

  await userEvent.click(
    within(rowOf('vip')).getByRole('button', { name: 'Edit' })
  )

  const keyInput = await screen.findByLabelText('Group key')
  expect(keyInput).toHaveValue('vip')
  expect(keyInput).toBeDisabled()
})
