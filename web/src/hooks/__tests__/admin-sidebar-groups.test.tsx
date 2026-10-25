import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { checkIsActive } from '@/components/layout/lib/url-utils'
import type { NavCollapsible, NavGroup } from '@/components/layout/types'
import { ROLE } from '@/lib/roles'

import { useSidebarData } from '../use-sidebar-data'

function adminGroup(): NavGroup {
  const { result } = renderHook(() => useSidebarData())
  const group = result.current.navGroups.find((g) => g.id === 'admin')
  if (!group) throw new Error('admin group missing')
  return group
}

function subUrls(item: NavCollapsible) {
  return item.items.map((sub) => sub.url)
}

describe('admin sidebar grouping', () => {
  it('keeps six top-level entries ordered supply → customers → finance → business → operations → settings', () => {
    const titles = adminGroup().items.map((item) => item.title)
    expect(titles).toEqual([
      'Channel Management',
      'Customers',
      'Finance Center',
      'Business Tools',
      'Operations Center',
      'System Settings',
    ])
  })

  it('groups channels, channel usage and models under channel management with model sub-sections kept active', () => {
    const channel = adminGroup().items[0] as NavCollapsible
    expect(subUrls(channel)).toEqual([
      '/channels',
      '/channels/usage',
      '/models/metadata',
    ])
    expect(channel.items[2]?.activeUrls).toEqual([
      '/models/metadata',
      '/models/vendors',
      '/models/deployments',
    ])
    // 处在模型页的其他分区时，父级「渠道管理」也要算激活（决定是否自动展开）
    expect(checkIsActive('/models/vendors', channel)).toBe(true)
    const models = channel.items[2] as NavCollapsible['items'][number]
    expect(checkIsActive('/models/vendors', models)).toBe(true)
    expect(checkIsActive('/users', channel)).toBe(false)
  })

  it('groups users, subscriptions, redemption codes and promoters under customers and quotes with trial requests under business tools', () => {
    const items = adminGroup().items
    expect(subUrls(items[1] as NavCollapsible)).toEqual([
      '/users',
      '/subscriptions',
      '/redemption-codes',
      '/promoters',
    ])
    expect(subUrls(items[3] as NavCollapsible)).toEqual([
      '/quotes',
      '/enterprise-leads',
    ])
  })

  it('restricts the operations center group to super admins while keeping finance center a direct link', () => {
    const items = adminGroup().items
    const operations = items[4] as NavCollapsible
    expect(operations.requiredRole).toBe(ROLE.SUPER_ADMIN)
    expect(subUrls(operations)).toEqual([
      '/system-info',
      '/task-plugins',
      '/log-archive',
    ])
    expect(items[2]).toMatchObject({ url: '/finance/overview' })
    expect(items[5]).toMatchObject({
      url: '/system-settings/site',
      requiredRole: ROLE.SUPER_ADMIN,
    })
  })
})
