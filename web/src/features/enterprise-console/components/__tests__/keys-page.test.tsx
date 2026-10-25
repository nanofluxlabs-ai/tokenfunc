import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { EnterpriseActor, EnterpriseToken } from '../../types'
import { EnterpriseKeys } from '../keys-page'

// 路由 search 用一个可变对象模拟；navigate 把函数式更新应用到它上面
const searchState: Record<string, unknown> = {}
const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => searchState,
    useNavigate: () => navigateMock,
  }),
  Link: (props: { children?: unknown }) => props.children ?? null,
}))

const apiMock = vi.hoisted(() => ({
  listEnterpriseTokens: vi.fn(),
  getEnterpriseTokenOptions: vi.fn(),
  updateEnterpriseTokenStatus: vi.fn(),
  batchUpdateEnterpriseTokenStatus: vi.fn(),
  batchDeleteEnterpriseTokens: vi.fn(),
  deleteEnterpriseToken: vi.fn(),
  fetchEnterpriseTokenKey: vi.fn(),
  listMembers: vi.fn(),
  listTeams: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const actorState = vi.hoisted(() => ({ actor: null as EnterpriseActor | null }))
vi.mock('../../hooks/use-enterprise-self', () => ({
  useEnterpriseSelf: () => ({
    data: actorState.actor
      ? { id: 1, name: 'Acme', actor: actorState.actor }
      : null,
    isLoading: false,
  }),
}))
vi.mock('../../hooks/use-team-options', () => ({
  useTeamOptions: () => [{ value: 6, label: 'Research' }],
  useTeams: () => ({ data: [] }),
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: null, loading: false, error: null }),
}))

const owner: EnterpriseActor = {
  member_id: 0,
  role: 'enterprise_admin',
  team_id: 0,
  is_owner: true,
  provisioned: false,
}
const developer: EnterpriseActor = {
  member_id: 8,
  role: 'developer',
  team_id: 6,
  is_owner: false,
  provisioned: true,
}

function token(
  partial: Partial<EnterpriseToken> & { id: number }
): EnterpriseToken {
  return {
    name: `key-${partial.id}`,
    key: 'abcd**********wxyz',
    status: 1,
    remain_quota: 0,
    unlimited_quota: true,
    used_quota: 0,
    expired_time: -1,
    created_time: 1,
    accessed_time: 1,
    group: '',
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    team_id: 6,
    team_name: 'Research',
    team_status: 'active',
    member_id: 0,
    member_name: '',
    month_quota: 0,
    prev_month_quota: 0,
    reset_period: '',
    period_quota: 0,
    next_reset_at: 0,
    ...partial,
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <EnterpriseKeys />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  for (const key of Object.keys(searchState)) delete searchState[key]
  actorState.actor = owner
  apiMock.listEnterpriseTokens.mockResolvedValue({
    success: true,
    data: {
      items: [
        token({ id: 1, name: 'alpha', member_id: 8, member_name: 'Alice' }),
        token({ id: 2, name: 'beta', status: 4, unlimited_quota: false }),
      ],
      total: 2,
    },
  })
  apiMock.getEnterpriseTokenOptions.mockResolvedValue({
    success: true,
    data: {
      owner_group: 'default',
      groups: [],
      models_by_group: {},
      limit: 100,
      total: 2,
    },
  })
  apiMock.batchUpdateEnterpriseTokenStatus.mockResolvedValue({
    success: true,
    data: { updated: 2, skipped: [] },
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

describe('EnterpriseKeys', () => {
  test('passes URL filters to the list request and renders team, holder and the four-state status', async () => {
    searchState.team_id = 6
    searchState.status = 4
    searchState.page = 2
    renderPage()

    expect(await screen.findByText('alpha')).toBeInTheDocument()
    expect(apiMock.listEnterpriseTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        team_id: 6,
        status: 4,
        p: 2,
        member_id: undefined,
      })
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    // 状态筛选下拉里也有同名选项，这里只断言表格里出现了四态文案
    expect(screen.getAllByText('Exhausted').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('combobox', { name: 'Filter by team' })
    ).toBeInTheDocument()
  })

  test('toggling "Expiring soon" writes the flag into the URL and resets the page', async () => {
    renderPage()
    await screen.findByText('alpha')

    fireEvent.click(screen.getByRole('button', { name: 'Expiring soon' }))

    expect(navigateMock).toHaveBeenCalled()
    const call = navigateMock.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    expect(call.search({ page: 3 })).toEqual({ page: 1, expiring: true })
  })

  test('selecting rows shows the bulk bar and disables the selected keys in one request', async () => {
    renderPage()
    await screen.findByText('alpha')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Disable selected' }))

    await waitFor(() =>
      expect(apiMock.batchUpdateEnterpriseTokenStatus).toHaveBeenCalledWith(
        [1, 2],
        2
      )
    )
  })

  test('a developer sees no team filter and no advanced settings link', async () => {
    actorState.actor = developer
    renderPage()
    await screen.findByText('alpha')

    expect(
      screen.queryByRole('combobox', { name: 'Filter by team' })
    ).toBeNull()
    expect(screen.queryByText('Advanced key settings')).toBeNull()
  })
})
