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
import { getRouteApi } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  EnterprisesPanel,
  EnterprisesPrimaryButtons,
  EnterprisesProvider,
} from '@/features/enterprises'

import { UsersDeleteDialog } from './components/users-delete-dialog'
import { UsersMutateDrawer } from './components/users-mutate-drawer'
import { UsersPrimaryButtons } from './components/users-primary-buttons'
import { UsersProvider, useUsers } from './components/users-provider'
import { UsersTable } from './components/users-table'
import {
  UserGroupsPanel,
  UserGroupsPrimaryButtons,
  UserGroupsProvider,
} from './groups'

const route = getRouteApi('/_authenticated/users/')

type UsersTabType = 'personal' | 'enterprise' | 'group'

// 三个页签各自的主按钮与内容；TokenFunc 二开加了「用户分组」注册表
const TAB_VIEWS: Record<
  UsersTabType,
  { actions: ReactNode; content: ReactNode }
> = {
  personal: { actions: <UsersPrimaryButtons />, content: <UsersTable /> },
  enterprise: {
    actions: <EnterprisesPrimaryButtons />,
    content: <EnterprisesPanel />,
  },
  group: {
    actions: <UserGroupsPrimaryButtons />,
    content: <UserGroupsPanel />,
  },
}

function UsersContent() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow } = useUsers()
  const navigate = route.useNavigate()
  const userType: UsersTabType = route.useSearch().type ?? 'personal'
  const view = TAB_VIEWS[userType]

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>{t('Users')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>{view.actions}</SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='flex h-full min-h-0 flex-col gap-4'>
            <Tabs
              value={userType}
              onValueChange={(value) => {
                // 切换页签时清空分页与筛选，两类列表的筛选条件互不通用
                void navigate({
                  search: { type: value as UsersTabType },
                })
              }}
            >
              <TabsList>
                <TabsTrigger value='personal'>
                  {t('Personal Users')}
                </TabsTrigger>
                <TabsTrigger value='enterprise'>
                  {t('Enterprise Users')}
                </TabsTrigger>
                <TabsTrigger value='group'>{t('User groups')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className='min-h-0 flex-1'>{view.content}</div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <UsersMutateDrawer
        open={open === 'create' || open === 'update'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={open === 'update' ? currentRow || undefined : undefined}
      />
      <UsersDeleteDialog />
    </>
  )
}

export function Users() {
  return (
    <UsersProvider>
      <EnterprisesProvider>
        <UserGroupsProvider>
          <UsersContent />
        </UserGroupsProvider>
      </EnterprisesProvider>
    </UsersProvider>
  )
}
