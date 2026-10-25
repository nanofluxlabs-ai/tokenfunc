import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { EditPromoterDialog } from '../components/edit-promoter-dialog'
import { PromotersProvider } from '../components/promoters-provider'
import type { PromoterListItem } from '../types'

const apiMock = vi.hoisted(() => ({
  updatePromoter: vi.fn().mockResolvedValue({ success: true, data: {} }),
}))
vi.mock('../api', () => apiMock)

const promoter: PromoterListItem = {
  id: 3,
  user_id: 30,
  username: 'promo',
  display_name: 'Promo',
  aff_code: 'PRM',
  remark: 'old remark',
  share_rate: 20,
  created_at: 0,
  email: '',
  deleted: false,
  bound_user_count: 1,
  month_net_quota: 0,
}

function renderDialog() {
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PromotersProvider>
        <EditPromoterDialog
          open
          onOpenChange={onOpenChange}
          promoter={promoter}
        />
      </PromotersProvider>
    </QueryClientProvider>
  )
  return { onOpenChange }
}

afterEach(() => {
  cleanup()
  apiMock.updatePromoter.mockClear()
})

test('prefills remark and share rate from the row and submits the edited values', async () => {
  const { onOpenChange } = renderDialog()
  const remark = screen.getByLabelText('Remark')
  const rate = screen.getByLabelText('Share rate (%)')
  expect(remark).toHaveValue('old remark')
  expect(rate).toHaveValue(20)

  await userEvent.clear(remark)
  await userEvent.type(remark, ' new remark ')
  await userEvent.clear(rate)
  await userEvent.type(rate, '12.5')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(apiMock.updatePromoter).toHaveBeenCalledWith(3, {
      remark: 'new remark',
      share_rate: 12.5,
    })
  )
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
})
