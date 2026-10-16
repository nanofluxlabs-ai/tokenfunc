/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { UsersProvider } from '../../users-provider'
import { UserTopupDialog } from '../user-topup-dialog'

const target = { id: 2, username: 'managed-user' }

function mockVerification(scope: string, proofToken: string) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/verify/methods') {
      return {
        data: {
          success: true,
          data: {
            scope,
            methods: [{ method: '2fa', available: true }],
            oauth_providers: [],
            password_encryption_enabled: false,
          },
        },
      }
    }
    return { data: { success: true, data: [] } }
  })
  return {
    data: {
      success: true,
      data: {
        proof_token: proofToken,
        method: '2fa',
        scope,
        expires_at: Math.floor(Date.now() / 1000) + 60,
      },
    },
  }
}

function renderDialog(onSuccess = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <UsersProvider>
        <UserTopupDialog
          open
          onOpenChange={vi.fn()}
          user={target}
          onSuccess={onSuccess}
        />
      </UsersProvider>
    </QueryClientProvider>
  )
  return onSuccess
}

async function fillAmount(value: string) {
  const amount = await screen.findByLabelText('Amount (USD)')
  await userEvent.clear(amount)
  await userEvent.type(amount, value)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('submits the manual top-up only with a single-use proof scoped to the user and the topup action', async () => {
  const proof = mockVerification('admin.user.manage', 'topup-proof')
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url === '/api/verify') return proof
    return { data: { success: true } }
  })
  const onSuccess = renderDialog()

  await fillAmount('12.5')
  await userEvent.type(await screen.findByLabelText('Reference'), 'REF-001')
  await userEvent.click(screen.getByRole('button', { name: 'Register top-up' }))

  await userEvent.type(
    await screen.findByLabelText('Authenticator code or backup code'),
    '123456'
  )
  expect(post).not.toHaveBeenCalledWith(
    '/api/user/topup/manual',
    expect.anything(),
    expect.anything()
  )
  await userEvent.click(screen.getByRole('button', { name: 'Verify' }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/user/topup/manual',
      {
        user_id: 2,
        amount_usd: 12.5,
        payment_method: 'bank_transfer',
        reference: 'REF-001',
      },
      expect.objectContaining({
        headers: { 'X-Security-Proof': 'topup-proof' },
        singleUseAuthorization: true,
      })
    )
  )
  expect(post).toHaveBeenCalledWith(
    '/api/verify',
    expect.objectContaining({
      scope: 'admin.user.manage',
      context: { user_id: 2, action: 'topup' },
    }),
    expect.anything()
  )
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
})

it('rejects a non-positive amount before asking for verification', async () => {
  const get = vi.spyOn(api, 'get')
  const post = vi.spyOn(api, 'post')
  renderDialog()

  await fillAmount('0')
  await userEvent.click(screen.getByRole('button', { name: 'Register top-up' }))

  expect(
    await screen.findByText('Top-up amount must be positive')
  ).toBeInTheDocument()
  expect(get).not.toHaveBeenCalledWith('/api/verify/methods', expect.anything())
  expect(post).not.toHaveBeenCalled()
})
