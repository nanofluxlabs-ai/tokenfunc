/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useLocation } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveSidebarView } from '@/components/layout/lib/sidebar-view-registry'
import type { NavGroup, ResolvedSidebarView } from '@/components/layout/types'
import { useEnterpriseSelf } from '@/features/enterprise-console/hooks/use-enterprise-self'
import {
  actorAtLeast,
  isEnterpriseAccount,
} from '@/features/enterprise-console/lib/member-roles'
import { usePromoterSelf } from '@/features/promoter-center/hooks/use-promoter-self'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { useSidebarConfig } from './use-sidebar-config'
import { useSidebarData } from './use-sidebar-data'

/** Sentinel key used for the root navigation in animation `key=` props */
const ROOT_VIEW_KEY = '__root'

/**
 * Resolve the active sidebar view for the current location.
 *
 * - Returns the matching nested {@link SidebarView} (with its nav
 *   groups) when the URL belongs to a registered drill-in workspace.
 * - Otherwise returns the root navigation, narrowed by:
 *     · admin-only group visibility (role-based);
 *     · `useSidebarConfig` (admin × user `sidebar_modules` overlay).
 *
 * Nested views are intentionally NOT passed through `useSidebarConfig`
 * — those filters target known dashboard URLs only, and gating is
 * already enforced at the route level (`beforeLoad` redirects).
 */
/** 企业账户在「个人」组里不展示的入口：钱包与个人对账都归企业财务对账 */
const PERSONAL_WALLET_URLS = new Set(['/wallet', '/reconciliation'])

export function useSidebarView(): ResolvedSidebarView {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (l) => l.pathname })
  const userRole = useAuthStore((s) => s.auth.user?.role)
  const rootSidebarData = useSidebarData()
  const configFilteredRoot = useSidebarConfig(rootSidebarData.navGroups)
  const enterprise = useEnterpriseSelf().data
  const isEnterpriseMember = Boolean(enterprise)
  // 账单 / 财务只给企业主与企业管理员；团队角色看不到
  const canSeeEnterpriseFinance = actorAtLeast(
    enterprise?.actor,
    'enterprise_admin'
  )
  // 企业账户（企业主与企业开通的账号）：钱包与 key 都在企业名下，只看企业菜单——
  // 隐藏「常规」组（企业组已有概览 / 密钥 / 用量）、「个人」组的钱包与个人对账，日志改在企业组下面的「日志」组；
  // 绑定已有账号的成员仍是普通钱包，菜单与普通用户一致
  const enterpriseAccount = isEnterpriseAccount(enterprise?.actor)
  const isPromoter = Boolean(usePromoterSelf().data)

  const rootNavGroups = useMemo<NavGroup[]>(() => {
    const role = userRole ?? ROLE.GUEST
    const isAdmin = role >= ROLE.ADMIN
    return configFilteredRoot
      .filter((group) => (group.id === 'admin' ? isAdmin : true))
      .filter((group) =>
        group.id === 'enterprise' ? isEnterpriseMember : true
      )
      .filter((group) => (group.id === 'promoter' ? isPromoter : true))
      .filter((group) => (group.id === 'general' ? !enterpriseAccount : true))
      .filter((group) => (group.id === 'logs' ? enterpriseAccount : true))
      .map((group) => {
        const items = group.items.filter(
          (item) =>
            (item.requiredRole === undefined || role >= item.requiredRole) &&
            (group.id !== 'enterprise' ||
              canSeeEnterpriseFinance ||
              item.url !== '/enterprise/bills') &&
            !(
              enterpriseAccount &&
              group.id === 'personal' &&
              PERSONAL_WALLET_URLS.has(String(item.url ?? ''))
            )
        )
        return items.length === group.items.length ? group : { ...group, items }
      })
  }, [
    configFilteredRoot,
    userRole,
    isEnterpriseMember,
    canSeeEnterpriseFinance,
    enterpriseAccount,
    isPromoter,
  ])

  const view = resolveSidebarView(pathname)

  if (view) {
    return {
      key: view.id,
      view,
      navGroups: view.getNavGroups(t),
    }
  }

  return {
    key: ROOT_VIEW_KEY,
    view: null,
    navGroups: rootNavGroups,
  }
}
