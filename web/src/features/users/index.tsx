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

const route = getRouteApi('/_authenticated/users/')

function UsersContent() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow } = useUsers()
  const navigate = route.useNavigate()
  const userType = route.useSearch().type ?? 'personal'
  const isEnterprise = userType === 'enterprise'

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>{t('Users')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          {isEnterprise ? (
            <EnterprisesPrimaryButtons />
          ) : (
            <UsersPrimaryButtons />
          )}
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='flex h-full min-h-0 flex-col gap-4'>
            <Tabs
              value={userType}
              onValueChange={(value) => {
                // 切换页签时清空分页与筛选，两类列表的筛选条件互不通用
                void navigate({
                  search: { type: value as 'personal' | 'enterprise' },
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
              </TabsList>
            </Tabs>
            <div className='min-h-0 flex-1'>
              {isEnterprise ? <EnterprisesPanel /> : <UsersTable />}
            </div>
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
        <UsersContent />
      </EnterprisesProvider>
    </UsersProvider>
  )
}
