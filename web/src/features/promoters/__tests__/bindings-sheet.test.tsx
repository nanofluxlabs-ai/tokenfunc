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

test('lists bound users with their source, scope and operator', async () => {
  renderSheet()
  expect(await screen.findByText('alice@example.com')).toBeInTheDocument()
  expect(screen.getByText('Admin binding')).toBeInTheDocument()
  expect(screen.getByText('All history')).toBeInTheDocument()
  expect(screen.getByText('root')).toBeInTheDocument()
  expect(apiMock.listPromoterBindings).toHaveBeenCalledWith(3)
})

test('batch bind sends one entry per line and honours the include-history toggle, then shows per-item results', async () => {
  renderSheet()
  await screen.findByText('alice@example.com')

  fireEvent.change(screen.getByRole('textbox', { name: 'Batch bind' }), {
    target: { value: 'bob\nroot\n\nbob' },
  })
  // 两个区块各有一个「包含历史消耗」勾选框，批量区是第二个；两者共用同一个状态
  fireEvent.click(screen.getAllByLabelText('Include historical consumption')[1])
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

test('bind button stays disabled until a user is picked and the batch button until text is entered', async () => {
  renderSheet()
  await screen.findByText('alice@example.com')
  expect(screen.getByRole('button', { name: 'Bind' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Bind all' })).toBeDisabled()
})
