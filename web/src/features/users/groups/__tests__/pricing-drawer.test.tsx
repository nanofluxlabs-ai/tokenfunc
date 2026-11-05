import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
]

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
  await screen.findByRole('switch', { name: 'Visible for Default' })
  return { onOpenChange }
}

function ratioInput(label: string) {
  return screen.getByRole('spinbutton', {
    name: `Ratio override for ${label}`,
  })
}

async function save() {
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(apiMock.saveUserGroupPricing).toHaveBeenCalled())
  return apiMock.saveUserGroupPricing.mock.calls[0][1] as {
    channel_group: string
    visible: boolean
    ratio: number | null
  }[]
}

beforeEach(() => {
  apiMock.getUserGroupPricing.mockResolvedValue({ success: true, data: ROWS })
  apiMock.saveUserGroupPricing.mockResolvedValue({ success: true, data: ROWS })
})

afterEach(() => {
  apiMock.getUserGroupPricing.mockReset()
  apiMock.saveUserGroupPricing.mockReset()
})

test('turning visibility off disables the ratio input and submits a null ratio for that row', async () => {
  await renderDrawer()

  await userEvent.click(
    screen.getByRole('switch', { name: 'Visible for Premium' })
  )

  expect(ratioInput('Premium')).toBeDisabled()
  const rows = await save()
  expect(rows.find((row) => row.channel_group === 'premium')).toEqual({
    channel_group: 'premium',
    visible: false,
    ratio: null,
  })
})

test('an empty ratio shows the base ratio as placeholder and submits null so the base price is inherited', async () => {
  await renderDrawer()

  expect(ratioInput('Default')).toHaveValue(null)
  expect(ratioInput('Default')).toHaveAttribute('placeholder', '1')

  const rows = await save()
  expect(rows.find((row) => row.channel_group === 'default')).toEqual({
    channel_group: 'default',
    visible: true,
    ratio: null,
  })
  expect(apiMock.saveUserGroupPricing).toHaveBeenCalledWith('vip', rows)
  expect(rows).toHaveLength(ROWS.length)
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

test('the visibility switch of a locked row is disabled and stays on', async () => {
  await renderDrawer()

  // Base UI 的 Switch 渲染为 span，禁用态用 aria-disabled 表达
  const lockedSwitch = screen.getByRole('switch', { name: 'Visible for VIP' })
  expect(lockedSwitch).toHaveAttribute('aria-disabled', 'true')
  expect(lockedSwitch).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(lockedSwitch)
  expect(lockedSwitch).toHaveAttribute('aria-checked', 'true')
})

test('checking "Only show differences" keeps only rows whose visibility or ratio differs from the base', async () => {
  await renderDrawer()

  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Only show differences' })
  )

  expect(
    screen.queryByRole('switch', { name: 'Visible for Default' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('switch', { name: 'Visible for VIP' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('switch', { name: 'Visible for Premium' })
  ).toBeInTheDocument()
})
