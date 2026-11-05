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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import type { User } from '../../types'
import { UsersMutateDrawer } from '../users-mutate-drawer'
import { UsersProvider } from '../users-provider'

const userGroupFixture = (key: string, kind: 'individual' | 'enterprise') => ({
  key,
  label: key,
  description: '',
  kind,
  order: 0,
  user_count: 0,
  override_count: 0,
})

// TokenFunc 二开：编辑普通用户时，分组下拉只列个人类型分组；历史落在企业分组的用户仍保留当前值
function renderDrawer(target: User) {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/tokenfunc/groups/user') {
      return {
        data: {
          success: true,
          data: [
            userGroupFixture('default', 'individual'),
            userGroupFixture('vip', 'individual'),
            userGroupFixture('ent_std', 'enterprise'),
          ],
        },
      }
    }
    if (url === '/api/authz/catalog') {
      return { data: { success: true, data: { resources: [], roles: [] } } }
    }
    return {
      data: { success: true, data: { ...target, admin_permissions: {} } },
    }
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <UsersProvider>
        <UsersMutateDrawer
          open
          onOpenChange={() => undefined}
          currentRow={target}
        />
      </UsersProvider>
    </QueryClientProvider>
  )
}

const baseUser: User = {
  id: 2,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  status: 1,
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
})

async function openGroupOptions() {
  const user = userEvent.setup()
  await screen.findByDisplayValue('Alice')
  const groupInput = await screen.findByRole('combobox', { name: 'Group' })
  await user.click(groupInput)
  await user.keyboard('{ArrowDown}')
  const options = await screen.findAllByRole('option')
  return options.map((option) => option.textContent?.trim())
}

it('lists only personal user groups when editing a personal user', async () => {
  renderDrawer(baseUser)

  const labels = await openGroupOptions()

  expect(labels).toEqual(['default', 'vip'])
})

it('keeps the user’s current enterprise group as an option so the field is not blank', async () => {
  renderDrawer({ ...baseUser, group: 'ent_std' })

  const labels = await openGroupOptions()

  expect(labels).toEqual(['default', 'vip', 'ent_std'])
})
