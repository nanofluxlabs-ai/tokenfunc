import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { EnterpriseActor, Member, Team } from '../../types'
import { EnterpriseTeams } from '../teams-page'

// 路由 search 用可变对象模拟，navigate 只记录调用
const searchState: Record<string, unknown> = {}
const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => searchState,
    useNavigate: () => navigateMock,
  }),
  Link: (props: {
    to: string
    search?: Record<string, unknown>
    children?: unknown
    className?: string
  }) => (
    <a
      href={`${props.to}?${new URLSearchParams(
        Object.entries(props.search ?? {}).map(([k, v]) => [k, String(v)])
      ).toString()}`}
      className={props.className}
    >
      {props.children as never}
    </a>
  ),
}))

const apiMock = vi.hoisted(() => ({
  listMembers: vi.fn(),
  listTeams: vi.fn(),
  deleteMember: vi.fn(),
  updateMember: vi.fn(),
  setMemberRole: vi.fn(),
  archiveTeam: vi.fn(),
  deleteTeam: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  createMember: vi.fn(),
  importMembers: vi.fn(),
  setMemberLogin: vi.fn(),
  removeMemberLogin: vi.fn(),
  getEnterpriseTokenOptions: vi.fn(),
  createEnterpriseToken: vi.fn(),
  updateEnterpriseToken: vi.fn(),
  fetchEnterpriseTokenKey: vi.fn(),
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

function team(partial: Partial<Team> & { id: number; name: string }): Team {
  return {
    sort: 0,
    is_default: false,
    status: 'active',
    monthly_budget_quota: 0,
    budget_alert_percent: 80,
    budget_enforce: false,
    created_at: 0,
    member_count: 0,
    token_count: 0,
    month_quota: 0,
    budget_percent: 0,
    budget_state: 'none',
    ...partial,
  }
}

function member(partial: Partial<Member> & { id: number }): Member {
  return {
    team_id: 6,
    team_name: 'Research',
    name: `Member ${partial.id}`,
    email: '',
    employee_no: '',
    user_id: 0,
    username: '',
    role: 'none',
    provisioned: false,
    status: 'active',
    remark: '',
    token_count: 0,
    month_quota: 0,
    created_at: 0,
    ...partial,
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <EnterpriseTeams />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  for (const key of Object.keys(searchState)) delete searchState[key]
  actorState.actor = owner
  apiMock.listTeams.mockResolvedValue({
    success: true,
    data: [
      team({ id: 5, name: 'Default', is_default: true, member_count: 1 }),
      team({ id: 6, name: 'Research', member_count: 2 }),
    ],
  })
  apiMock.listMembers.mockResolvedValue({
    success: true,
    data: {
      items: [
        member({
          id: 8,
          name: 'Alice',
          user_id: 3,
          username: 'alice',
          role: 'team_admin',
          token_count: 2,
          month_quota: 500000,
        }),
        member({ id: 9, name: 'Bob', status: 'disabled' }),
      ],
      total: 2,
    },
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function setMobileViewport() {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query === '(max-width: 640px)',
  }))
}

describe('EnterpriseTeams', () => {
  test('passes the URL team and filters to the member list and renders login, key and usage deep links', async () => {
    searchState.team_id = 6
    searchState.status = 'active'
    searchState.login = true
    searchState.page = 2
    renderPage()

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(apiMock.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        team_id: 6,
        status: 'active',
        has_login: true,
        p: 2,
      })
    )
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('Team admin')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute(
      'href',
      '/enterprise/keys?team_id=6&member_id=8'
    )
    const usageLink = screen
      .getAllByRole('link')
      .find((link) =>
        link.getAttribute('href')?.startsWith('/enterprise/usage')
      )
    expect(usageLink).toHaveAttribute(
      'href',
      '/enterprise/usage?group_by=token&member_id=8'
    )
    expect(screen.getByText('Key only')).toBeInTheDocument()
  })

  test('selecting a team writes team_id into the URL and clears the page', async () => {
    renderPage()
    await screen.findByText('Alice')

    fireEvent.click(screen.getByRole('button', { name: /Research/ }))

    const call = navigateMock.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    expect(call.search({ page: 3, q: 'x' })).toEqual({ q: 'x', team_id: 6 })
  })

  test('on mobile the team list collapses into a switcher sheet that writes team_id and closes', async () => {
    setMobileViewport()
    renderPage()
    await screen.findByText('Alice')

    // 列表不再常驻，只留当前团队的切换按钮
    expect(screen.queryByRole('button', { name: /Research/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Switch team' }))
    fireEvent.click(await screen.findByRole('button', { name: /Research/ }))

    const call = navigateMock.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    expect(call.search({ page: 3 })).toEqual({ team_id: 6 })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Research/ })).toBeNull()
    )
  })

  test('owner sees all-members, add team / add member / import actions and the row menu', async () => {
    renderPage()
    await screen.findByText('Alice')

    expect(
      screen.getByRole('button', { name: 'All Members' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Team' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add Member' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Import Members' })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Open menu' })).toHaveLength(2)
    // 团队行的编辑 / 设管理员 / 归档 / 删除收进竖向三点菜单
    expect(
      screen.getAllByRole('button', { name: 'Team actions' }).length
    ).toBeGreaterThan(0)
  })

  test('a developer only sees their own team and the issue-key action', async () => {
    actorState.actor = developer
    renderPage()
    await screen.findByText('Alice')

    expect(screen.queryByRole('button', { name: 'All Members' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Team' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Member' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Team actions' })).toBeNull()
    // 团队角色不显示团队列表，只有一行本团队页头
    expect(screen.queryByRole('button', { name: /Research/ })).toBeNull()
    expect(screen.getByText('2 members')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Issue API Key' })
    ).toHaveLength(2)
    expect(apiMock.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ team_id: 6 })
    )
  })
})
