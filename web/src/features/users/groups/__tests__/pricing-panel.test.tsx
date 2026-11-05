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

import type { UserGroupItem, UserGroupPricingRow } from '@/lib/tokenfunc-groups'

import { UserGroupPricingPanel } from '..'

const apiMock = vi.hoisted(() => ({
  listUserGroups: vi.fn(),
  createUserGroup: vi.fn(),
  getUserGroupPricing: vi.fn(),
  saveUserGroupPricing: vi.fn(),
}))
vi.mock('@/lib/tokenfunc-groups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tokenfunc-groups')>()),
  ...apiMock,
}))

function makeGroup(overrides: Partial<UserGroupItem>): UserGroupItem {
  return {
    key: 'default',
    label: 'Default',
    description: '',
    kind: 'individual',
    order: 0,
    user_count: 0,
    override_count: 0,
    ...overrides,
  }
}

function makeRow(overrides: Partial<UserGroupPricingRow>): UserGroupPricingRow {
  return {
    channel_group: 'default',
    label: 'Default',
    base_ratio: 1,
    default_visible: true,
    visible: true,
    ratio: null,
    effective_ratio: 1,
    locked: false,
    ...overrides,
  }
}

const GROUPS: UserGroupItem[] = [
  makeGroup({}),
  makeGroup({
    key: 'ent_std',
    label: 'Enterprise standard',
    kind: 'enterprise',
    order: 1,
    override_count: 2,
  }),
]

/** 每个用户分组各自一套定价行，用渠道分组名区分来源 */
const PRICING: Record<string, UserGroupPricingRow[]> = {
  default: [
    makeRow({}),
    makeRow({ channel_group: 'premium', label: 'Premium' }),
  ],
  ent_std: [
    makeRow({}),
    makeRow({
      channel_group: 'ent_pool',
      label: 'Enterprise pool',
      ratio: 0.7,
    }),
  ],
}

async function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // 「前往用户分组」是站内 Link，需要一个最小的内存路由
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <UserGroupPricingPanel />
      </QueryClientProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()
  await screen.findByRole('spinbutton', { name: 'Ratio override for Default' })
}

function groupList() {
  return within(screen.getByRole('list', { name: 'User groups' }))
}

function ratioInput(label: string) {
  return screen.getByRole('spinbutton', {
    name: `Ratio override for ${label}`,
  })
}

beforeEach(() => {
  apiMock.listUserGroups.mockResolvedValue({ success: true, data: GROUPS })
  apiMock.getUserGroupPricing.mockImplementation(async (key: string) => ({
    success: true,
    data: PRICING[key] ?? [],
  }))
  apiMock.saveUserGroupPricing.mockImplementation(async (key: string) => ({
    success: true,
    data: PRICING[key] ?? [],
  }))
})

afterEach(() => {
  for (const mock of Object.values(apiMock)) mock.mockReset()
})

test('the first user group is selected by default and its pricing rows are loaded', async () => {
  await renderPanel()

  expect(groupList().getByRole('button', { name: /Default/ })).toHaveAttribute(
    'aria-current',
    'true'
  )
  expect(apiMock.getUserGroupPricing).toHaveBeenCalledWith('default')
  expect(ratioInput('Premium')).toBeInTheDocument()
  expect(
    screen.queryByRole('spinbutton', {
      name: 'Ratio override for Enterprise pool',
    })
  ).not.toBeInTheDocument()
})

test('clicking another user group loads that group’s pricing rows', async () => {
  await renderPanel()

  await userEvent.click(
    groupList().getByRole('button', { name: /Enterprise standard/ })
  )

  expect(
    await screen.findByRole('spinbutton', {
      name: 'Ratio override for Enterprise pool',
    })
  ).toBeInTheDocument()
  expect(apiMock.getUserGroupPricing).toHaveBeenCalledWith('ent_std')
  expect(
    groupList().getByRole('button', { name: /Enterprise standard/ })
  ).toHaveAttribute('aria-current', 'true')
  expect(ratioInput('Enterprise pool')).toHaveValue(0.7)
})

test('the save button stays disabled until a ratio changes, then submits only the selected group’s rows', async () => {
  await renderPanel()
  const saveButton = screen.getByRole('button', { name: 'Save' })
  expect(saveButton).toBeDisabled()

  await userEvent.type(ratioInput('Premium'), '0.9')
  expect(saveButton).toBeEnabled()
  await userEvent.click(saveButton)

  await waitFor(() =>
    expect(apiMock.saveUserGroupPricing).toHaveBeenCalledTimes(1)
  )
  expect(apiMock.saveUserGroupPricing).toHaveBeenCalledWith('default', [
    { channel_group: 'default', visible: true, ratio: null },
    { channel_group: 'premium', visible: true, ratio: 0.9 },
  ])
})

test('reordering a row alone enables saving and submits the rows in the new order', async () => {
  await renderPanel()

  await userEvent.click(screen.getByRole('button', { name: 'Move Premium up' }))
  const saveButton = screen.getByRole('button', { name: 'Save' })
  expect(saveButton).toBeEnabled()
  await userEvent.click(saveButton)

  await waitFor(() =>
    expect(apiMock.saveUserGroupPricing).toHaveBeenCalledWith('default', [
      { channel_group: 'premium', visible: true, ratio: null },
      { channel_group: 'default', visible: true, ratio: null },
    ])
  )
})

test('switching groups with unsaved changes asks for confirmation and keeps the current group on cancel', async () => {
  await renderPanel()
  await userEvent.type(ratioInput('Premium'), '2')

  await userEvent.click(
    groupList().getByRole('button', { name: /Enterprise standard/ })
  )

  const dialog = await screen.findByRole('alertdialog')
  expect(
    within(dialog).getByText('Discard unsaved changes?')
  ).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(groupList().getByRole('button', { name: /Default/ })).toHaveAttribute(
    'aria-current',
    'true'
  )
  expect(ratioInput('Premium')).toHaveValue(2)
})

test('creating a user group from the left column calls createUserGroup and selects the new group', async () => {
  const created = makeGroup({ key: 'new_tier', label: 'New tier', order: 2 })
  apiMock.createUserGroup.mockImplementation(async () => {
    // 创建成功后列表接口才会带上新分组
    apiMock.listUserGroups.mockResolvedValue({
      success: true,
      data: [...GROUPS, created],
    })
    return { success: true }
  })
  await renderPanel()

  await userEvent.click(screen.getByRole('button', { name: 'Add user group' }))
  await userEvent.type(await screen.findByLabelText('Group key'), 'new_tier')
  await userEvent.type(screen.getByLabelText('Name'), 'New tier')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

  await waitFor(() =>
    expect(apiMock.createUserGroup).toHaveBeenCalledWith({
      key: 'new_tier',
      label: 'New tier',
      kind: 'individual',
      description: '',
    })
  )
  expect(
    await groupList().findByRole('button', { name: /New tier/ })
  ).toHaveAttribute('aria-current', 'true')
  await waitFor(() =>
    expect(apiMock.getUserGroupPricing).toHaveBeenCalledWith('new_tier')
  )
})

test('confirming the discard dialog switches to the other group and drops the edits', async () => {
  await renderPanel()
  await userEvent.type(ratioInput('Premium'), '2')
  await userEvent.click(
    groupList().getByRole('button', { name: /Enterprise standard/ })
  )

  const dialog = await screen.findByRole('alertdialog')
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Discard changes' })
  )

  expect(
    await screen.findByRole('spinbutton', {
      name: 'Ratio override for Enterprise pool',
    })
  ).toBeInTheDocument()
  expect(apiMock.saveUserGroupPricing).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
})
