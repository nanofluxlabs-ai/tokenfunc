import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { EnterpriseToken, Member } from '../../types'
import { TokenMutateSheet } from '../token-mutate-sheet'

const apiMock = vi.hoisted(() => ({
  createEnterpriseToken: vi.fn(),
  updateEnterpriseToken: vi.fn(),
  fetchEnterpriseTokenKey: vi.fn(),
  getEnterpriseTokenOptions: vi.fn(),
  listMembers: vi.fn(),
  listTeams: vi.fn(),
}))
vi.mock('../../api', () => apiMock)
vi.mock('../../hooks/use-enterprise-self', () => ({
  useEnterpriseSelf: () => ({
    data: {
      id: 1,
      name: 'Acme',
      actor: {
        member_id: 0,
        role: 'enterprise_admin',
        team_id: 0,
        is_owner: true,
        provisioned: false,
      },
    },
    isLoading: false,
  }),
}))
vi.mock('../../hooks/use-team-options', () => ({
  useTeamOptions: () => [{ value: 6, label: 'Research' }],
  useTeams: () => ({ data: [] }),
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://api.example.com' },
    loading: false,
    error: null,
  }),
}))

const alice: Member = {
  id: 8,
  team_id: 6,
  team_name: 'Research',
  name: 'Alice',
  email: 'alice@example.com',
  employee_no: 'E1',
  user_id: 0,
  username: '',
  role: 'none',
  provisioned: false,
  status: 'active',
  remark: '',
  token_count: 0,
  month_quota: 0,
  created_at: 0,
}

const existing: EnterpriseToken = {
  id: 3,
  name: 'old-key',
  key: 'abcd**********wxyz',
  status: 1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  expired_time: -1,
  created_time: 1,
  accessed_time: 1,
  group: 'default',
  model_limits_enabled: true,
  model_limits: 'gpt-4o',
  allow_ips: '10.0.0.0/8',
  team_id: 6,
  team_name: 'Research',
  team_status: 'active',
  member_id: 8,
  member_name: 'Alice',
  month_quota: 0,
  prev_month_quota: 0,
  effective_status: 1,
  reset_period: '',
  period_quota: 0,
  next_reset_at: 0,
}

function renderSheet(props: Partial<Parameters<typeof TokenMutateSheet>[0]>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onSaved = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <TokenMutateSheet
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>
  )
  return { onSaved, onOpenChange }
}

beforeEach(() => {
  apiMock.getEnterpriseTokenOptions.mockResolvedValue({
    success: true,
    data: {
      owner_group: 'default',
      groups: [{ value: 'default', desc: 'Default group', ratio: 1 }],
      models_by_group: { '': ['gpt-4o'], default: ['gpt-4o', 'o3'] },
      limit: 100,
      total: 1,
    },
  })
  apiMock.createEnterpriseToken.mockResolvedValue({
    success: true,
    data: { id: 9 },
  })
  apiMock.updateEnterpriseToken.mockResolvedValue({ success: true })
  apiMock.fetchEnterpriseTokenKey.mockResolvedValue({
    success: true,
    data: { key: 'newkey123' },
  })
  apiMock.listMembers.mockResolvedValue({
    success: true,
    data: { items: [], total: 0 },
  })
  apiMock.listTeams.mockResolvedValue({ success: true, data: [] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('TokenMutateSheet', () => {
  test('issuing from a member row fixes team and holder, then shows the key and handover text', async () => {
    const { onSaved } = renderSheet({ member: alice })

    expect(
      await screen.findByText('Issue API Key to Alice')
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Team' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Holder' })).toBeNull()
    expect(screen.getByLabelText('Name')).toHaveValue('Alice')

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(apiMock.createEnterpriseToken).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Alice',
          team_id: 6,
          member_id: 8,
          unlimited_quota: true,
          expired_time: -1,
          model_limits: [],
        })
      )
    )
    expect(await screen.findByTestId('created-key')).toHaveTextContent(
      'sk-newkey123'
    )
    expect(screen.getByText(/Hi Alice,/)).toBeInTheDocument()
    expect(
      screen.getByText(/Base URL: https:\/\/api.example.com/)
    ).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalled()
  })

  test('editing prefills restrictions and submits them back as a list', async () => {
    const { onOpenChange } = renderSheet({ token: existing })

    expect(await screen.findByText('Edit API Key')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText('Name')).toHaveValue('old-key')
    )
    expect(screen.getByLabelText('IP Whitelist (supports CIDR)')).toHaveValue(
      '10.0.0.0/8'
    )

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'renamed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(apiMock.updateEnterpriseToken).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          name: 'renamed',
          team_id: 6,
          member_id: 8,
          group: 'default',
          model_limits: ['gpt-4o'],
          allow_ips: '10.0.0.0/8',
        })
      )
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('choosing a periodic quota sends the policy and uses the period amount as the remaining quota', async () => {
    renderSheet({ member: alice })
    expect(
      await screen.findByText('Issue API Key to Alice')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Periodic quota/ }))
    expect(screen.getByLabelText('Reset period')).toHaveValue('daily')
    expect(screen.getByText(/Next reset: /)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Period quota (USD)'), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(apiMock.createEnterpriseToken).toHaveBeenCalledWith(
        expect.objectContaining({
          unlimited_quota: false,
          remain_quota: 500_000,
          quota_policy: {
            reset_period: 'daily',
            custom_seconds: 0,
            period_quota: 500_000,
          },
        })
      )
    )
  })

  test('editing a periodic key preselects the periodic mode and clears the policy when switched to fixed', async () => {
    renderSheet({
      token: {
        ...existing,
        unlimited_quota: false,
        remain_quota: 1_000_000,
        reset_period: 'weekly',
        period_quota: 2_500_000,
        next_reset_at: 1_792_944_000,
      },
    })
    expect(await screen.findByText('Edit API Key')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText('Reset period')).toHaveValue('weekly')
    )
    expect(screen.getByLabelText('Period quota (USD)')).toHaveValue(5)

    fireEvent.click(screen.getByRole('radio', { name: /Fixed quota/ }))
    expect(screen.queryByLabelText('Reset period')).toBeNull()
    fireEvent.change(screen.getByLabelText('Quota (USD)'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(apiMock.updateEnterpriseToken).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          unlimited_quota: false,
          remain_quota: 1_500_000,
          quota_policy: {
            reset_period: 'never',
            custom_seconds: 0,
            period_quota: 0,
          },
        })
      )
    )
  })
})
