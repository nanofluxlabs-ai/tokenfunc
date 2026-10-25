import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NavGroup } from '@/components/layout/types'
import type { EnterpriseActor } from '@/features/enterprise-console/types'

import { useSidebarView } from '../use-sidebar-view'

const enterpriseState = vi.hoisted(() => ({
  actor: null as EnterpriseActor | null,
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => '/dashboard/overview',
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: { role: 1 } } }),
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
})
