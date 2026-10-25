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
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  Gauge,
  Receipt,
  ReceiptText,
  KeyRound,
  ClipboardList,
  FileText,
  FlaskConical,
  Key,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  MessageSquare,
  Radio,
  Scale,
  ServerCog,
  Settings,
  ShieldCheck,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SidebarData } from '@/components/layout/types'
import { ROLE } from '@/lib/roles'

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()

  return {
    navGroups: [
      {
        id: 'chat',
        title: t('Chat'),
        items: [
          {
            title: t('Playground'),
            url: '/playground',
            icon: FlaskConical,
          },
          {
            title: t('Chat'),
            icon: MessageSquare,
            type: 'chat-presets',
          },
        ],
      },
      {
        id: 'general',
        title: t('General'),
        items: [
          {
            title: t('Overview'),
            url: '/dashboard/overview',
            icon: Activity,
          },
          {
            title: t('Dashboard'),
            url: '/dashboard/models',
            icon: LayoutDashboard,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
          },
          {
            title: t('Usage Logs'),
            url: '/usage-logs/common',
            icon: FileText,
          },
          {
            title: t('Audit Logs'),
            url: '/usage-logs/audit',
            icon: ClipboardList,
          },
          {
            title: t('Task Logs'),
            url: '/usage-logs/task',
            activeUrls: ['/usage-logs/drawing'],
            configUrls: ['/usage-logs/drawing', '/usage-logs/task'],
            icon: ListTodo,
          },
        ],
      },
      {
        // 企业控制台：企业主与已开通登录的成员可见，账单仅企业主/企业管理员（见 use-sidebar-view）
        id: 'enterprise',
        title: t('Enterprise'),
        items: [
          {
            title: t('Enterprise Overview'),
            url: '/enterprise/overview',
            icon: Gauge,
          },
          {
            title: t('Teams'),
            url: '/enterprise/organization',
            icon: Building2,
          },
          {
            title: t('API Keys'),
            url: '/enterprise/keys',
            icon: KeyRound,
          },
          {
            title: t('Usage Report'),
            url: '/enterprise/usage',
            icon: BarChart3,
          },
          {
            title: t('Bills'),
            url: '/enterprise/bills',
            icon: Receipt,
          },
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          {
            title: t('Wallet'),
            url: '/wallet',
            icon: Wallet,
          },
          {
            title: t('Reconciliation'),
            url: '/reconciliation',
            icon: Scale,
          },
          {
            title: t('Profile'),
            url: '/profile',
            icon: User,
          },
          {
            title: t('Security & Access'),
            url: '/security',
            icon: ShieldCheck,
          },
        ],
      },
      {
        // 推广中心：仅推广人可见（见 use-sidebar-view）
        id: 'promoter',
        title: t('Promotion'),
        items: [
          {
            title: t('Promoter Center'),
            url: '/promoter-center',
            icon: Megaphone,
          },
        ],
      },
      {
        // 管理员菜单（TokenFunc 二开）按「供给 → 客户 → 经营 → 运维」分组，一级项控制在 6 个
        id: 'admin',
        title: t('Admin'),
        items: [
          {
            // 供给侧：渠道、渠道消耗、模型（模型元数据 / 定价本质是供给配置）
            title: t('Channel Management'),
            icon: Radio,
            items: [
              {
                title: t('Channels'),
                url: '/channels',
              },
              {
                title: t('Channel Usage'),
                url: '/channels/usage',
              },
              {
                title: t('Models'),
                url: '/models/metadata',
                activeUrls: [
                  '/models/metadata',
                  '/models/vendors',
                  '/models/deployments',
                ],
              },
            ],
          },
          {
            // 客户侧：用户、订阅、兑换码
            title: t('Customers'),
            icon: Users,
            items: [
              {
                title: t('Users'),
                url: '/users',
              },
              {
                title: t('Subscriptions'),
                url: '/subscriptions',
              },
              {
                title: t('Redemption Codes'),
                url: '/redemption-codes',
              },
              {
                title: t('Promoters'),
                url: '/promoters',
              },
            ],
          },
          {
            // 经营侧：财务中心页内已有多个 tab，保持单项
            title: t('Finance Center'),
            url: '/finance/overview',
            icon: ReceiptText,
            activeUrls: [
              '/finance/overview',
              '/finance/orders',
              '/finance/user-consumption',
              '/finance/model-consumption',
              '/finance/enterprise-bills',
            ],
          },
          {
            // 商务：报价单与试用申请（销售线索，转化后才成为用户）
            title: t('Business Tools'),
            icon: Briefcase,
            items: [
              {
                title: t('Quotations'),
                url: '/quotes',
              },
              {
                title: t('Trial Requests'),
                url: '/enterprise-leads',
              },
            ],
          },
          {
            // 运维：两个子项都只对 Root 开放，角色限制放在分组上
            title: t('Operations Center'),
            icon: ServerCog,
            requiredRole: ROLE.SUPER_ADMIN,
            items: [
              {
                title: t('System Info'),
                url: '/system-info',
              },
              {
                title: t('Task Plugins'),
                url: '/task-plugins',
              },
              {
                title: t('Log Archive'),
                url: '/log-archive',
              },
            ],
          },
          {
            // 系统设置自带二级导航，保持单项
            title: t('System Settings'),
            url: '/system-settings/site',
            activeUrls: ['/system-settings'],
            icon: Settings,
            requiredRole: ROLE.SUPER_ADMIN,
          },
        ],
      },
    ],
  }
}
