import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import type { EnterpriseActor } from '@/features/enterprise-console/types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { TokenfuncAuditLogs } from '../tokenfunc-audit-page'

const enterpriseState = vi.hoisted(() => ({
  actor: null as EnterpriseActor | null,
}))

vi.mock('@/features/enterprise-console/hooks/use-enterprise-self', () => ({
  ENTERPRISE_SELF_QUERY_KEY: ['enterprise', 'self'],
  useEnterpriseSelf: () => ({
    data: enterpriseState.actor
      ? { id: 1, name: 'Acme', actor: enterpriseState.actor }
      : null,
  }),
}))

const entry = {
  event_id: 'ev-1',
  user_id: 7,
  username: 'carol',
  actor_role: 1,
  created_at: 1700000000,
  category: 'security',
  action: 'enterprise.member.create',
  token_ref: '',
  ip: '192.0.2.1',
  user_agent: 'ua',
  method: '',
  route: '',
  status: 200,
  success: true,
  request_id: 'req-1',
  content: '',
  other: null,
}

function renderPage(role: number, actor: EnterpriseActor | null) {
  enterpriseState.actor = actor
  useAuthStore.getState().auth.setUser({
    id: 7,
    username: 'carol',
    role,
    permissions: { admin_permissions: { audit: { read: true } } },
  })
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: [entry], total: 1 } },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <TokenfuncAuditLogs />
    </QueryClientProvider>
  )
  return get
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.setUser(null)
})

const enterpriseAdmin: EnterpriseActor = {
  member_id: 3,
  role: 'enterprise_admin',
  team_id: 0,
  is_owner: false,
  provisioned: true,
}

it('enterprise admins open on this enterprise without request method or route columns', async () => {
  const get = renderPage(1, enterpriseAdmin)
  expect(
    screen.getByRole('tab', { name: 'This enterprise', selected: true })
  ).toBeInTheDocument()
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/api/enterprise/audit', {
      params: expect.anything(),
    })
  )
  expect(await screen.findAllByText('carol')).not.toHaveLength(0)
  expect(
    screen.queryByRole('columnheader', { name: 'Route' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('columnheader', { name: 'Method' })
  ).not.toBeInTheDocument()
})

it('team roles only see their own records', async () => {
  const get = renderPage(1, { ...enterpriseAdmin, role: 'developer' })
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/api/audit/self', {
      params: expect.anything(),
    })
  )
  expect(
    screen.queryByRole('columnheader', { name: 'Route' })
  ).not.toBeInTheDocument()
})

it('platform admins keep the all view with request routes', async () => {
  const get = renderPage(10, null)
  expect(
    screen.getByRole('tab', { name: 'All', selected: true })
  ).toBeInTheDocument()
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/api/audit', {
      params: expect.anything(),
    })
  )
  expect(
    await screen.findByRole('columnheader', { name: 'Route' })
  ).toBeInTheDocument()
})
