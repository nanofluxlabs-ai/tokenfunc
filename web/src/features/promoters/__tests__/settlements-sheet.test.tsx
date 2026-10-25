import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { PromotersProvider } from '../components/promoters-provider'
import { SettlementsSheet } from '../components/settlements-sheet'
import type { PromoterListItem } from '../types'

const apiMock = vi.hoisted(() => ({
  markPromoterSettled: vi.fn().mockResolvedValue({ success: true }),
  revertPromoterSettlement: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('../api', () => apiMock)
vi.mock('@/features/promoter-center/api', () => ({
  listPromoterSettlements: vi.fn().mockResolvedValue({
    success: true,
    data: {
      items: [
        {
          month: '2026-10',
          settleable: false,
          net_quota: 1,
          credit_paid_quota: 0,
          credit_unpaid_quota: 0,
          settled: false,
          users: [],
        },
        {
          month: '2026-09',
          settleable: true,
          net_quota: 750_000,
          credit_paid_quota: 0,
          credit_unpaid_quota: 0,
          settled: false,
          users: [],
        },
        {
          month: '2026-08',
          settleable: true,
          net_quota: 900_000,
          credit_paid_quota: 0,
          credit_unpaid_quota: 0,
          settled: true,
          settlement: {
            id: 1,
            amount_usd: '61.5',
            remark: '',
            settled_at: 1_760_000_000,
            reference: 'TX-1',
            settled_by: 1,
            settled_by_username: 'admin',
          },
          users: [],
        },
      ],
    },
  }),
}))

const promoter: PromoterListItem = {
  id: 3,
  user_id: 30,
  username: 'promo',
  display_name: 'Promo',
  aff_code: 'PRM',
  remark: '',
  share_rate: 20,
  created_at: 0,
  email: '',
  deleted: false,
  bound_user_count: 1,
  month_net_quota: 0,
}

function renderSheet() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PromotersProvider>
        <SettlementsSheet open onOpenChange={() => {}} promoter={promoter} />
      </PromotersProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  apiMock.markPromoterSettled.mockClear()
  apiMock.revertPromoterSettlement.mockClear()
})

test('shows the pending month count and marks a pending month as settled with the entered reference', async () => {
  renderSheet()
  expect(await screen.findByText('Pending months: 1')).toBeInTheDocument()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Mark as settled' })
  )
  const dialog = await screen.findByRole('dialog', { name: 'Mark as settled' })
  await userEvent.type(within(dialog).getByLabelText('Bank reference'), 'TX-9')
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Mark as settled' })
  )
  await waitFor(() =>
    expect(apiMock.markPromoterSettled).toHaveBeenCalledWith(3, {
      month: '2026-09',
      amount_usd: undefined,
      reference: 'TX-9',
      remark: '',
    })
  )
})

test('reverting a settled month asks for confirmation and then calls the revert endpoint', async () => {
  renderSheet()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Revert settlement' })
  )
  const confirm = await screen.findByRole('alertdialog')
  expect(confirm).toHaveTextContent('2026-08')
  await userEvent.click(
    within(confirm).getByRole('button', { name: 'Revert settlement' })
  )
  await waitFor(() =>
    expect(apiMock.revertPromoterSettlement).toHaveBeenCalledWith(3, '2026-08')
  )
})
