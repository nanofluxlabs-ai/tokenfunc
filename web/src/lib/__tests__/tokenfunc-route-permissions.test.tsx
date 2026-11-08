import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { NavCollapsible, NavGroup } from '@/components/layout/types'
import { useSidebarData } from '@/hooks/use-sidebar-data'
import { ROLE } from '@/lib/roles'
import { Route as ChannelsRoute } from '@/routes/_authenticated/channels/index'
import { Route as ChannelUsageRoute } from '@/routes/_authenticated/channels/usage'
import { type AuthUser, useAuthStore } from '@/stores/auth-store'

import {
  canAccessRoute,
  filterNavGroupsByRoutePermission,
} from '../tokenfunc-route-permissions'

function admin(channel: Record<string, boolean>): AuthUser {
  return {
    id: 7,
    username: 'operator',
    role: ROLE.ADMIN,
    permissions: { admin_permissions: { channel } },
  }
}

function channelManagementUrls(groups: NavGroup[]): string[] | undefined {
  const adminGroup = groups.find((group) => group.id === 'admin')
  const channel = adminGroup?.items.find(
    (item) => item.title === 'Channel Management'
  ) as NavCollapsible | undefined
  return channel?.items.map((item) => String(item.url))
}

function sidebarGroups(): NavGroup[] {
  return renderHook(() => useSidebarData()).result.current.navGroups
}

/** 调用路由 beforeLoad，返回被重定向到的地址；放行时返回 null */
function redirectOf(route: { options: { beforeLoad?: unknown } }) {
  const beforeLoad = route.options.beforeLoad as () => void
  try {
    beforeLoad()
    return null
  } catch (error) {
    return (error as { options?: { to?: string } }).options?.to ?? 'thrown'
  }
}

afterEach(() => {
  useAuthStore.getState().auth.setUser(null)
})

describe('pages that need channel.read', () => {
  it('lets an admin with channel.read and the root user in', () => {
    expect(canAccessRoute(admin({ read: true }), '/channels')).toBe(true)
    expect(
      canAccessRoute(
        { id: 1, username: 'root', role: ROLE.SUPER_ADMIN },
        '/channels/usage'
      )
    ).toBe(true)
  })

  it('keeps pages without a registered permission open to every admin', () => {
    expect(canAccessRoute(admin({ read: false }), '/models/metadata')).toBe(
      true
    )
  })

  it('hides channels and channel usage from the menu but keeps models when channel.read is revoked', () => {
    const groups = filterNavGroupsByRoutePermission(
      sidebarGroups(),
      admin({ read: false })
    )
    expect(channelManagementUrls(groups)).toEqual(['/models/metadata'])
  })

  it('leaves the channel management menu untouched when channel.read is granted', () => {
    const groups = filterNavGroupsByRoutePermission(
      sidebarGroups(),
      admin({ read: true })
    )
    expect(channelManagementUrls(groups)).toEqual([
      '/channels',
      '/channels/usage',
      '/models/metadata',
    ])
  })

  it('redirects to 403 before loading the channel pages when channel.read is revoked', () => {
    useAuthStore.getState().auth.setUser(admin({ read: false }))
    expect(redirectOf(ChannelsRoute)).toBe('/403')
    expect(redirectOf(ChannelUsageRoute)).toBe('/403')

    useAuthStore.getState().auth.setUser(admin({ read: true }))
    expect(redirectOf(ChannelsRoute)).toBeNull()
    expect(redirectOf(ChannelUsageRoute)).toBeNull()
  })
})
