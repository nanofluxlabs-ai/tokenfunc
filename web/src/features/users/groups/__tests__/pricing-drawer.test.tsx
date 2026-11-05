import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { UserGroupItem, UserGroupPricingRow } from '@/lib/tokenfunc-groups'

import { UserGroupPricingDrawer } from '../components/user-group-pricing-drawer'

const apiMock = vi.hoisted(() => ({
  getUserGroupPricing: vi.fn(),
  saveUserGroupPricing: vi.fn(),
}))
vi.mock('@/lib/tokenfunc-groups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tokenfunc-groups')>()),
  ...apiMock,
}))

const GROUP: UserGroupItem = {
  key: 'vip',
  label: 'VIP',
  description: '',
  kind: 'individual',
  order: 1,
  user_count: 2,
  override_count: 1,
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

/** 接口顺序：可见的按该用户分组自己的顺序在前，不可见的在后 */
const ROWS: UserGroupPricingRow[] = [
  makeRow({}),
  // vip 用户分组自己的渠道分组：上游总把它算作可见
  makeRow({
    channel_group: 'vip',
    label: 'VIP',
    base_ratio: 0.8,
    default_visible: false,
    effective_ratio: 0.8,
    locked: true,
  }),
  makeRow({
    channel_group: 'premium',
    label: 'Premium',
    base_ratio: 1.5,
    ratio: 1.2,
    effective_ratio: 1.2,
  }),
  makeRow({
    channel_group: 'hidden_pool',
    label: 'Hidden pool',
    base_ratio: 2,
    default_visible: false,
    visible: false,
    effective_ratio: 2,
  }),
]

type SubmittedRow = {
  channel_group: string
  visible: boolean
  ratio: number | null
}

async function renderDrawer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <UserGroupPricingDrawer open onOpenChange={onOpenChange} group={GROUP} />
    </QueryClientProvider>
  )
  await screen.findByRole('spinbutton', { name: 'Ratio override for Default' })
  return { onOpenChange }
}

function ratioInput(label: string) {
  return screen.getByRole('spinbutton', {
    name: `Ratio override for ${label}`,
  })
}

/** 可见列表里的渠道分组名称，按显示顺序 */
function listedGroups(): string[] {
  return within(screen.getByRole('list', { name: 'Channel groups' }))
    .getAllByRole('spinbutton')
    .map((input) =>
      (input.getAttribute('aria-label') ?? '').replace(
        'Ratio override for ',
        ''
      )
    )
}

/** 打开「添加渠道分组」候选列表；选项的可访问名称含 key 与基准倍率说明，用前缀匹配 */
async function openCandidates() {
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Add channel group' })
  )
  await userEvent.keyboard('{ArrowDown}')
}

async function pickCandidate(label: string) {
  await openCandidates()
  await userEvent.click(
    await screen.findByRole('option', { name: new RegExp(`^${label}`) })
  )
}

async function save(): Promise<SubmittedRow[]> {
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(apiMock.saveUserGroupPricing).toHaveBeenCalled())
  return apiMock.saveUserGroupPricing.mock.calls[0][1] as SubmittedRow[]
}

beforeEach(() => {
  apiMock.getUserGroupPricing.mockResolvedValue({ success: true, data: ROWS })
  apiMock.saveUserGroupPricing.mockResolvedValue({ success: true, data: ROWS })
})

afterEach(() => {
  apiMock.getUserGroupPricing.mockReset()
  apiMock.saveUserGroupPricing.mockReset()
})

test('lists only the visible channel groups in the order returned by the API', async () => {
  await renderDrawer()

  expect(listedGroups()).toEqual(['Default', 'VIP', 'Premium'])
  expect(
    screen.queryByRole('spinbutton', { name: 'Ratio override for Hidden pool' })
  ).not.toBeInTheDocument()
})

test('adding a candidate appends it to the end of the list and submits it as visible', async () => {
  await renderDrawer()

  await pickCandidate('Hidden pool')

  expect(listedGroups()).toEqual(['Default', 'VIP', 'Premium', 'Hidden pool'])
  const rows = await save()
  expect(rows.map((row) => row.channel_group)).toEqual([
    'default',
    'vip',
    'premium',
    'hidden_pool',
  ])
  expect(rows[3]).toEqual({
    channel_group: 'hidden_pool',
    visible: true,
    ratio: null,
  })
})

test('removing a row returns it to the candidates and submits it as hidden with a null ratio', async () => {
  await renderDrawer()

  await userEvent.click(screen.getByRole('button', { name: 'Remove Premium' }))

  expect(listedGroups()).toEqual(['Default', 'VIP'])
  await openCandidates()
  expect(await screen.findByRole('option', { name: /^Premium/ })).toBeVisible()
  await userEvent.keyboard('{Escape}')

  const rows = await save()
  expect(rows.find((row) => row.channel_group === 'premium')).toEqual({
    channel_group: 'premium',
    visible: false,
    ratio: null,
  })
  expect(rows).toHaveLength(ROWS.length)
})

test('moving a row up submits the rows in the new order', async () => {
  await renderDrawer()

  await userEvent.click(screen.getByRole('button', { name: 'Move Premium up' }))

  expect(listedGroups()).toEqual(['Default', 'Premium', 'VIP'])
  const rows = await save()
  expect(apiMock.saveUserGroupPricing).toHaveBeenCalledWith('vip', rows)
  expect(rows.map((row) => row.channel_group)).toEqual([
    'default',
    'premium',
    'vip',
    'hidden_pool',
  ])
})

test('the locked row cannot be removed but can still be reordered', async () => {
  await renderDrawer()

  expect(screen.getByRole('button', { name: 'Remove VIP' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move VIP up' })).toBeEnabled()
  expect(ratioInput('VIP')).toBeEnabled()
})

test('an empty ratio shows the base ratio as placeholder and submits null so the base price is inherited', async () => {
  await renderDrawer()

  expect(ratioInput('Default')).toHaveValue(null)
  expect(ratioInput('Default')).toHaveAttribute('placeholder', '1')
  expect(ratioInput('Premium')).toHaveValue(1.2)

  const rows = await save()
  expect(rows.find((row) => row.channel_group === 'default')).toEqual({
    channel_group: 'default',
    visible: true,
    ratio: null,
  })
})

test('typing 0.9 into the ratio input submits ratio 0.9 for that row', async () => {
  await renderDrawer()

  await userEvent.type(ratioInput('Default'), '0.9')

  const rows = await save()
  expect(rows.find((row) => row.channel_group === 'default')).toEqual({
    channel_group: 'default',
    visible: true,
    ratio: 0.9,
  })
})

test('the add combobox is disabled when every channel group is already listed', async () => {
  apiMock.getUserGroupPricing.mockResolvedValue({
    success: true,
    data: ROWS.slice(0, 3),
  })
  await renderDrawer()

  expect(
    screen.getByRole('combobox', { name: 'Add channel group' })
  ).toBeDisabled()
})
