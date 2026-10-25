import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { BindingsSheet } from '../components/bindings-sheet'
import { PromotersProvider } from '../components/promoters-provider'
import type { PromoterListItem } from '../types'

const apiMock = vi.hoisted(() => ({
  listPromoterBindings: vi.fn(),
  bindPromoterUsers: vi.fn(),
  unbindPromoterUser: vi.fn(),
}))
vi.mock('../api', () => apiMock)
vi.mock('@/features/users/api', () => ({
  searchUsers: vi
    .fn()
    .mockResolvedValue({ success: true, data: { items: [] } }),
}))

const promoter: PromoterListItem = {
  id: 3,
  user_id: 30,
  username: 'promo',
  display_name: 'Promo',
  aff_code: 'PRM',
  remark: '',
  created_at: 0,
  email: '',
  deleted: false,
  bound_user_count: 1,
  month_net_quota: 0,
}

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PromotersProvider>
        <BindingsSheet open onOpenChange={() => {}} promoter={promoter} />
      </PromotersProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  apiMock.listPromoterBindings.mockResolvedValue({
    success: true,
    data: {
      range: { start: 0, end_excl: 0, start_day: '', end_day: '' },
      items: [
        {
          user_id: 41,
          username: 'alice',
          display_name: 'Alice',
          is_enterprise: false,
          deleted: false,
          source: 'admin',
          bound_at: 1_700_000_000,
          usage_since: 0,
          net_quota: 500_000,
          request_count: 3,
          total_tokens: 100,
          last_consume_day: '2026-03-10',
          email: 'alice@example.com',
          group: 'vip',
          bound_by_username: 'root',
        },
      ],
    },
  })
  apiMock.bindPromoterUsers.mockResolvedValue({
    success: true,
    data: {
      bound: [{ id: 42, username: 'bob', display_name: 'Bob', role: 1 }],
      failed: [
        {
          input: 'root',
          reason_key: 'Admin accounts cannot be bound',
        },
      ],
    },
  })
})

afterEach(() => {
  cleanup()
  apiMock.listPromoterBindings.mockReset()
  apiMock.bindPromoterUsers.mockReset()
  apiMock.unbindPromoterUser.mockReset()
})

test('lists bound users with group, source, scope, operator and month consumption columns', async () => {
  renderSheet()
  expect(await screen.findByText('alice@example.com')).toBeInTheDocument()
  for (const header of [
    'Group',
    'Source',
    'Bound at',
    'Operator',
    'Month consumption',
  ]) {
    expect(
      screen.getByRole('columnheader', { name: header })
    ).toBeInTheDocument()
  }
  expect(screen.getByText('vip')).toBeInTheDocument()
  // 七列在抽屉宽度内放不下：表格保底宽度，由 Table 外层 overflow-x-auto 容器横向滚动
  expect(screen.getByRole('table').className).toMatch(/min-w-\[/)
  expect(screen.getByText('Admin binding')).toBeInTheDocument()
  expect(screen.getByText('All history')).toBeInTheDocument()
  expect(screen.getByText('root')).toBeInTheDocument()
  expect(apiMock.listPromoterBindings).toHaveBeenCalledWith(3)
})

test('batch bind panel is collapsed by default and expands from the toolbar button', async () => {
  renderSheet()
  await screen.findByText('alice@example.com')
  expect(
    screen.queryByRole('textbox', { name: 'Batch bind' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(
      'Cannot bind: the promoter themselves, admins, or users already assigned to another promoter'
    )
  ).toBeInTheDocument()

  const toggle = screen.getByRole('button', { name: 'Batch bind' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(toggle)

  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(
    await screen.findByRole('textbox', { name: 'Batch bind' })
  ).toBeInTheDocument()
})

test('batch bind sends one entry per line and honours the include-history toggle, then shows per-item results', async () => {
  renderSheet()
  await screen.findByText('alice@example.com')
  fireEvent.click(screen.getByRole('button', { name: 'Batch bind' }))

  fireEvent.change(await screen.findByRole('textbox', { name: 'Batch bind' }), {
    target: { value: 'bob\nroot\n\nbob' },
  })
  // 单个添加与批量绑定共用同一个「包含历史消耗」勾选框
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Include historical consumption' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Bind all' }))

  await waitFor(() =>
    expect(apiMock.bindPromoterUsers).toHaveBeenCalledWith(3, {
      inputs: ['bob', 'root'],
      include_history: true,
    })
  )
  expect(await screen.findByText('bob #42')).toBeInTheDocument()
  expect(screen.getByText('Admin accounts cannot be bound')).toBeInTheDocument()
})

test('add button stays disabled until a user is picked and the batch button until text is entered', async () => {
  renderSheet()
  await screen.findByText('alice@example.com')
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Batch bind' }))
  expect(await screen.findByRole('button', { name: 'Bind all' })).toBeDisabled()
})
