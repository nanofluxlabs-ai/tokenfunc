import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { GroupFilterSelect } from '../group-filter-select'

// 财务筛选：用户消耗按用户分组，模型消费按渠道分组，两张注册表分别取、都按后台排序显示名称
const groupsMock = vi.hoisted(() => ({
  listUserGroups: vi.fn(),
  listChannelGroups: vi.fn(),
}))
vi.mock('@/lib/tokenfunc-groups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tokenfunc-groups')>()),
  listUserGroups: groupsMock.listUserGroups,
  listChannelGroups: groupsMock.listChannelGroups,
}))

function renderSelect(kind: 'user' | 'channel') {
  groupsMock.listUserGroups.mockResolvedValue({
    success: true,
    data: [
      {
        key: 'default',
        label: 'default',
        description: '',
        kind: 'individual',
        order: 0,
        user_count: 3,
        override_count: 0,
      },
      {
        key: 'ent_std',
        label: '企业标准',
        description: '',
        kind: 'enterprise',
        order: 1,
        user_count: 1,
        override_count: 2,
      },
    ],
  })
  groupsMock.listChannelGroups.mockResolvedValue({
    success: true,
    data: [
      {
        key: 'gptpro',
        label: 'GPT 高速池',
        order: 0,
        ratio: 1,
        topup_ratio: 1,
        default_visible: true,
      },
      {
        key: 'default',
        label: 'default',
        order: 1,
        ratio: 1,
        topup_ratio: 1,
        default_visible: true,
      },
    ],
  })
  const onChange = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GroupFilterSelect kind={kind} value='' onChange={onChange} />
    </QueryClientProvider>
  )
  return onChange
}

test('user kind lists user groups by name with the key in brackets', async () => {
  const user = userEvent.setup()
  const onChange = renderSelect('user')

  await user.click(screen.getByRole('combobox', { name: 'Group' }))
  const option = await screen.findByRole('option', {
    name: '企业标准 (ent_std)',
  })
  expect(groupsMock.listChannelGroups).not.toHaveBeenCalled()

  await user.click(option)
  expect(onChange).toHaveBeenCalledWith('ent_std')
})

test('channel kind lists channel groups in the configured order', async () => {
  const user = userEvent.setup()
  renderSelect('channel')

  await user.click(screen.getByRole('combobox', { name: 'Group' }))
  await screen.findByRole('option', { name: 'GPT 高速池 (gptpro)' })
  const names = screen
    .getAllByRole('option')
    .map((option) => option.textContent)
  expect(names).toEqual(['All groups', 'GPT 高速池 (gptpro)', 'default'])
  expect(groupsMock.listUserGroups).not.toHaveBeenCalled()
})
