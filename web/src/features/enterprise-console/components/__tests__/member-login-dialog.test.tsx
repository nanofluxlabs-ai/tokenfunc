import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { EnterpriseActor, Member } from '../../types'
import { MemberLoginDialog } from '../member-login-dialog'

const apiMock = vi.hoisted(() => ({
  removeMemberLogin: vi.fn(),
  resetMemberLoginPassword: vi.fn(),
  setMemberLogin: vi.fn(),
  setMemberRole: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const ownerActor: EnterpriseActor = {
  member_id: 0,
  role: 'enterprise_admin',
  team_id: 0,
  is_owner: true,
  provisioned: false,
}

const baseMember: Member = {
  id: 7,
  team_id: 6,
  team_name: 'Research',
  name: 'Carol',
  email: 'carol@example.com',
  employee_no: '',
  user_id: 42,
  username: 'carol-e2m7',
  role: 'developer',
  provisioned: true,
  status: 'active',
  remark: '',
  token_count: 1,
  month_quota: 0,
  created_at: 0,
}

function renderDialog(member: Member | null, actor: EnterpriseActor = ownerActor) {
  const onSaved = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <MemberLoginDialog
      member={member}
      actor={actor}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  )
  return { onSaved, onOpenChange }
}

beforeEach(() => {
  apiMock.resetMemberLoginPassword.mockResolvedValue({
    success: true,
    data: { user_id: 42, username: 'carol-e2m7', password: 'NewPass123xyz' },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('MemberLoginDialog password reset', () => {
  test('provisioned member: reset confirms the session revocation, then shows the one-time password', async () => {
    const { onSaved } = renderDialog(baseMember)

    expect(
      await screen.findByText('Carol signs in as carol-e2m7.')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(
      screen.getByText(/active sessions and access tokens are revoked/i)
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() =>
      expect(apiMock.resetMemberLoginPassword).toHaveBeenCalledWith(7)
    )
    expect(await screen.findByText('Password reset')).toBeInTheDocument()
    expect(screen.getByText('NewPass123xyz')).toBeInTheDocument()
    expect(screen.getByText('New password')).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalled()
  })

  test('bound personal member: no reset entry, points to the sign-in page instead', async () => {
    renderDialog({ ...baseMember, id: 8, name: 'Bound', username: 'bounduser', provisioned: false })

    expect(
      await screen.findByText('Bound signs in as bounduser.')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reset password' })
    ).toBeNull()
    expect(
      screen.getByText(/reset the password from the sign-in page/i)
    ).toBeInTheDocument()
  })

  test('member without login: grant flow only, no reset entry', async () => {
    renderDialog({ ...baseMember, user_id: 0, username: '', role: 'none', provisioned: false })

    expect(
      await screen.findByRole('button', { name: 'Create account' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reset password' })
    ).toBeNull()
  })
})
