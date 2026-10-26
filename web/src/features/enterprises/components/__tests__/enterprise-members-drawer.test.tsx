import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import type { Member } from '@/features/enterprise-console/types'

import type { EnterpriseListItem } from '../../types'
import { EnterpriseMembersDrawer } from '../enterprise-members-drawer'

const apiMock = vi.hoisted(() => ({
  listEnterpriseMembers: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const enterprise = {
  id: 3,
  name: 'Acme',
  member_count: 2,
  login_count: 1,
} as EnterpriseListItem

function makeMember(overrides: Partial<Member>): Member {
  return {
    id: 1,
    team_id: 7,
    team_name: 'R&D',
    name: 'Alice',
    email: 'alice@acme.test',
    employee_no: 'E001',
    user_id: 0,
    username: '',
    role: 'none',
    provisioned: false,
    status: 'active',
    remark: '',
    token_count: 0,
    month_quota: 0,
    created_at: 0,
    ...overrides,
  }
}

function renderDrawer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <EnterpriseMembersDrawer
        open
        onOpenChange={() => undefined}
        currentRow={enterprise}
      />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  apiMock.listEnterpriseMembers.mockReset()
})

test('members render with account, role and key-only markers but without any management action', async () => {
  apiMock.listEnterpriseMembers.mockResolvedValue({
    success: true,
    data: {
      items: [
        makeMember({
          id: 1,
          user_id: 42,
          username: 'alice-e3m1',
          role: 'developer',
          token_count: 3,
        }),
        makeMember({
          id: 2,
          name: 'Bob',
          email: '',
          employee_no: '',
          status: 'disabled',
        }),
      ],
      total: 2,
    },
  })
  renderDrawer()

  expect(await screen.findByText('alice-e3m1')).toBeInTheDocument()
  expect(screen.getByText('Developer')).toBeInTheDocument()
  expect(screen.getByText('alice@acme.test')).toBeInTheDocument()
  expect(screen.getByText('Key only')).toBeInTheDocument()
  expect(screen.getByText('Disabled')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
  expect(apiMock.listEnterpriseMembers).toHaveBeenCalledWith(
    3,
    expect.objectContaining({ p: 1, page_size: 10 })
  )
})

test('an enterprise without members shows the read-only empty state', async () => {
  apiMock.listEnterpriseMembers.mockResolvedValue({
    success: true,
    data: { items: [], total: 0 },
  })
  renderDrawer()

  expect(await screen.findByText('No members yet')).toBeInTheDocument()
})

test('typing a keyword and choosing "Can sign in" are forwarded as request filters', async () => {
  apiMock.listEnterpriseMembers.mockResolvedValue({
    success: true,
    data: { items: [], total: 0 },
  })
  renderDrawer()
  await screen.findByText('No members yet')

  await userEvent.type(screen.getByLabelText('Search members'), 'ali')
  await waitFor(() =>
    expect(apiMock.listEnterpriseMembers).toHaveBeenLastCalledWith(
      3,
      expect.objectContaining({ keyword: 'ali', has_login: undefined })
    )
  )

  await userEvent.click(
    screen.getByRole('combobox', { name: 'Filter by console access' })
  )
  await userEvent.click(
    await screen.findByRole('option', { name: 'Can sign in' })
  )
  await waitFor(() =>
    expect(apiMock.listEnterpriseMembers).toHaveBeenLastCalledWith(
      3,
      expect.objectContaining({ keyword: 'ali', has_login: true, p: 1 })
    )
  )
})
