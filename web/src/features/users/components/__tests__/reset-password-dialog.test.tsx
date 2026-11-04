import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ResetPasswordDialog } from '../reset-password-dialog'
import { UsersProvider } from '../users-provider'

const target = { id: 2, username: 'managed-user' }

// 二次验证：/api/verify/methods 返回 2FA 可用，之后的 POST 返回一次性 proof
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

function renderDialog(onOpenChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <UsersProvider>
        <ResetPasswordDialog open onOpenChange={onOpenChange} user={target} />
      </UsersProvider>
    </QueryClientProvider>
  )
  return onOpenChange
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('resets the password only after step-up verification and shows the new password once', async () => {
  const proof = mockVerification('admin.user.password.reset', 'reset-proof')
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url === '/api/user/2/reset_password') {
      return {
        data: {
          success: true,
          data: {
            user_id: 2,
            username: 'managed-user',
            password: 'generated-pass-0123',
          },
        },
      }
    }
    return proof
  })
  renderDialog()

  await userEvent.click(
    await screen.findByRole('button', { name: 'Reset password' })
  )
  await screen.findByLabelText('Authenticator code or backup code')
  expect(post).not.toHaveBeenCalledWith(
    '/api/user/2/reset_password',
    undefined,
    expect.anything()
  )

  await userEvent.type(
    screen.getByLabelText('Authenticator code or backup code'),
    '123456'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Verify' }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/user/2/reset_password',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Security-Proof': 'reset-proof',
        }),
      })
    )
  )
  expect(await screen.findByText('generated-pass-0123')).toBeInTheDocument()
  expect(screen.getByText('managed-user')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Copy password' })
  ).toBeInTheDocument()
})

it('closes without calling the API when the confirmation is cancelled', async () => {
  const post = vi.spyOn(api, 'post')
  const onOpenChange = renderDialog()

  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

  expect(post).not.toHaveBeenCalled()
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
