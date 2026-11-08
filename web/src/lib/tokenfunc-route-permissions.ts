// TokenFunc 二开：整页依赖某项管理员权限的页面。没有该权限时，侧栏 / 搜索不显示入口，直接访问跳 403，
// 页面也就不会一加载就请求被拒的接口、弹「权限不足」。页内的单个操作仍由各页面按权限置灰。
import type { NavGroup, NavItem } from '@/components/layout/types'
import type { AuthUser } from '@/stores/auth-store'

import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from './admin-permissions'

type RoutePermission = { resource: string; action: string }

const CHANNEL_READ: RoutePermission = {
  resource: ADMIN_PERMISSION_RESOURCES.CHANNEL,
  action: ADMIN_PERMISSION_ACTIONS.READ,
}

// 与后端接口所需权限保持一致：渠道列表 GET /api/channel/、渠道消耗 GET /api/channel/usage_stats 都是 channel.read
const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  '/channels': CHANNEL_READ,
  '/channels/usage': CHANNEL_READ,
}

/** 页面未登记权限时恒为 true，只按角色由路由自己判断 */
export function canAccessRoute(
  user: AuthUser | null | undefined,
  url: string
): boolean {
  const permission = ROUTE_PERMISSIONS[url]
  return (
    !permission || hasPermission(user, permission.resource, permission.action)
  )
}

/** 去掉无权进入的菜单项；子项全被去掉的折叠组整个隐藏 */
export function filterNavGroupsByRoutePermission(
  groups: NavGroup[],
  user: AuthUser | null | undefined
): NavGroup[] {
  return groups.map((group) => {
    const items = group.items.flatMap((item): NavItem[] => {
      if (item.items) {
        const subItems = item.items.filter((sub) =>
          canAccessRoute(user, String(sub.url))
        )
        if (subItems.length === 0) return []
        return [
          subItems.length === item.items.length
            ? item
            : { ...item, items: subItems },
        ]
      }
      if (item.url !== undefined && !canAccessRoute(user, String(item.url))) {
        return []
      }
      return [item]
    })
    return items.length === group.items.length &&
      items.every((item, index) => item === group.items[index])
      ? group
      : { ...group, items }
  })
}
