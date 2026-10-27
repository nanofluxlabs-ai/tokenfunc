import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NavGroup } from '@/components/layout/types'
import type { EnterpriseActor } from '@/features/enterprise-console/types'

import { useSidebarView } from '../use-sidebar-view'

const enterpriseState = vi.hoisted(() => ({
  actor: null as EnterpriseActor | null,
  role: 1,
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => '/dashboard/overview',
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: { role: enterpriseState.role } } }),
}))
vi.mock('../use-sidebar-config', () => ({
  useSidebarConfig: (groups: NavGroup[]) => groups,
}))
vi.mock('@/components/layout/lib/sidebar-view-registry', () => ({
  resolveSidebarView: () => null,
}))
vi.mock('@/features/enterprise-console/hooks/use-enterprise-self', () => ({
  useEnterpriseSelf: () => ({
    data: enterpriseState.actor
      ? { id: 1, name: 'Acme', actor: enterpriseState.actor }
      : null,
  }),
}))
vi.mock('@/features/promoter-center/hooks/use-promoter-self', () => ({
  usePromoterSelf: () => ({ data: null }),
}))

function urlsOf(groups: NavGroup[], id: string): string[] {
  return (groups.find((group) => group.id === id)?.items ?? []).map((item) =>
    'url' in item ? String(item.url) : ''
  )
}

beforeEach(() => {
  enterpriseState.actor = null
  enterpriseState.role = 1
})

describe('enterprise sidebar visibility', () => {
  it('keeps the upstream /keys entry for ordinary users and hides the enterprise group', () => {
    const { result } = renderHook(() => useSidebarView())
    expect(urlsOf(result.current.navGroups, 'general')).toContain('/keys')
    expect(result.current.navGroups.some((g) => g.id === 'enterprise')).toBe(
      false
    )
  })

  it('hides upstream /keys for the enterprise owner and shows the enterprise key page instead', () => {
    enterpriseState.actor = {
      member_id: 0,
      role: 'enterprise_admin',
      team_id: 0,
      is_owner: true,
      provisioned: false,
    }
    const { result } = renderHook(() => useSidebarView())
    expect(urlsOf(result.current.navGroups, 'general')).not.toContain('/keys')
    expect(urlsOf(result.current.navGroups, 'enterprise')).toContain(
      '/enterprise/keys'
    )
    expect(urlsOf(result.current.navGroups, 'enterprise')).toContain(
      '/enterprise/bills'
    )
  })

  it('hides upstream /keys and bills for a provisioned developer but keeps /keys for a member bound to an existing account', () => {
    enterpriseState.actor = {
      member_id: 8,
      role: 'developer',
      team_id: 6,
      is_owner: false,
      provisioned: true,
    }
    const provisioned = renderHook(() => useSidebarView())
    expect(
      urlsOf(provisioned.result.current.navGroups, 'general')
    ).not.toContain('/keys')
    expect(
      urlsOf(provisioned.result.current.navGroups, 'enterprise')
    ).not.toContain('/enterprise/bills')

    enterpriseState.actor = { ...enterpriseState.actor, provisioned: false }
    const bound = renderHook(() => useSidebarView())
    expect(urlsOf(bound.result.current.navGroups, 'general')).toContain('/keys')
  })

  it('shows the enterprise account only enterprise, logs and a trimmed personal group', () => {
    enterpriseState.actor = {
      member_id: 0,
      role: 'enterprise_admin',
      team_id: 0,
      is_owner: true,
      provisioned: false,
    }
    const { result } = renderHook(() => useSidebarView())
    const ids = result.current.navGroups.map((group) => group.id)
    expect(ids).not.toContain('general')
    expect(ids.indexOf('logs')).toBe(ids.indexOf('enterprise') + 1)
    expect(urlsOf(result.current.navGroups, 'logs')).toEqual([
      '/usage-logs/common',
      '/usage-logs/audit',
      '/usage-logs/task',
    ])
    expect(urlsOf(result.current.navGroups, 'personal')).toEqual([
      '/profile',
      '/security',
    ])
    expect(urlsOf(result.current.navGroups, 'enterprise')).toContain(
      '/enterprise/bills'
    )
  })

  it('keeps the ordinary menu for a member bound to an existing account and hides the logs group from non-enterprise users', () => {
    const ordinary = renderHook(() => useSidebarView())
    expect(ordinary.result.current.navGroups.map((g) => g.id)).not.toContain(
      'logs'
    )
    expect(urlsOf(ordinary.result.current.navGroups, 'general')).toContain(
      '/usage-logs/common'
    )

    enterpriseState.actor = {
      member_id: 8,
      role: 'team_admin',
      team_id: 6,
      is_owner: false,
      provisioned: false,
    }
    const bound = renderHook(() => useSidebarView())
    const ids = bound.result.current.navGroups.map((g) => g.id)
    expect(ids).toContain('general')
    expect(ids).not.toContain('logs')
    expect(urlsOf(bound.result.current.navGroups, 'personal')).toContain(
      '/wallet'
    )
  })

  it('shows the audit log entry only to platform admins and enterprise owners / admins', () => {
    const audit = '/usage-logs/audit'
    const personal = renderHook(() => useSidebarView())
    expect(urlsOf(personal.result.current.navGroups, 'general')).not.toContain(
      audit
    )

    enterpriseState.actor = {
      member_id: 8,
      role: 'developer',
      team_id: 6,
      is_owner: false,
      provisioned: true,
    }
    const developer = renderHook(() => useSidebarView())
    expect(urlsOf(developer.result.current.navGroups, 'logs')).not.toContain(
      audit
    )

    enterpriseState.actor = {
      ...enterpriseState.actor,
      role: 'enterprise_admin',
    }
    const entAdmin = renderHook(() => useSidebarView())
    expect(urlsOf(entAdmin.result.current.navGroups, 'logs')).toContain(audit)

    enterpriseState.actor = null
    enterpriseState.role = 10
    const admin = renderHook(() => useSidebarView())
    expect(urlsOf(admin.result.current.navGroups, 'general')).toContain(audit)
  })
})
