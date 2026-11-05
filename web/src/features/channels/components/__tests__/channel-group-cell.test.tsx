import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { Channel } from '../../types'
import { ChannelGroupCell } from '../channel-group-cell'

// 渠道列表分组列：显示渠道分组名称（悬浮 key），单个渠道可在弹层里改分组，Tag 聚合行只读
const groupsMock = vi.hoisted(() => ({ listChannelGroups: vi.fn() }))
vi.mock('@/lib/tokenfunc-groups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tokenfunc-groups')>()),
  listChannelGroups: groupsMock.listChannelGroups,
}))
const actionsMock = vi.hoisted(() => ({ handleUpdateChannelGroups: vi.fn() }))
vi.mock('../../lib/channel-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/channel-actions')>()),
  handleUpdateChannelGroups: actionsMock.handleUpdateChannelGroups,
}))

function renderCell(channel: Partial<Channel>) {
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
        label: '默认池',
        order: 1,
        ratio: 1,
        topup_ratio: 1,
        default_visible: true,
      },
    ],
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChannelGroupCell
        channel={{ id: 9, group: 'default', ...channel } as Channel}
      />
    </QueryClientProvider>
  )
}

test('shows the registry name of each group with the key as tooltip', async () => {
  renderCell({ group: 'default,legacy' })

  await screen.findAllByText('默认池')
  const texts = (title: string) =>
    screen.getAllByTitle(title).map((element) => element.textContent)
  expect(texts('default')).toContain('默认池')
  // 不在定价表里的分组按 key 显示
  expect(texts('legacy')).toContain('legacy')
})

test('saving the popover sends the checked group keys and blocks an empty choice', async () => {
  const user = userEvent.setup()
  actionsMock.handleUpdateChannelGroups.mockResolvedValue(true)
  renderCell({ group: 'default' })
  await screen.findAllByTitle('default')

  await user.click(screen.getByRole('button', { name: 'Edit groups' }))
  const dialog = await screen.findByText('Edit groups', { selector: 'p' })
  const popover = dialog.parentElement as HTMLElement
  const gptpro = within(popover).getByRole('checkbox', { name: /GPT 高速池/ })
  const defaultPool = within(popover).getByRole('checkbox', { name: /默认池/ })
  expect(defaultPool).toBeChecked()
  // 取消掉唯一的分组：不能保存，并提示至少保留一个
  await user.click(defaultPool)
  expect(defaultPool).not.toBeChecked()
  expect(within(popover).getByRole('button', { name: 'Save' })).toBeDisabled()
  expect(
    within(popover).getByText('Keep at least one group')
  ).toBeInTheDocument()

  await user.click(gptpro)
  await user.click(defaultPool)
  await user.click(within(popover).getByRole('button', { name: 'Save' }))
  expect(actionsMock.handleUpdateChannelGroups).toHaveBeenCalledWith(
    9,
    ['gptpro', 'default'],
    expect.anything()
  )
})

test('tag aggregate rows are read-only', async () => {
  renderCell({
    group: 'default',
    tag: 'pool',
    children: [],
  } as Partial<Channel>)

  await screen.findAllByTitle('default')
  expect(
    screen.queryByRole('button', { name: 'Edit groups' })
  ).not.toBeInTheDocument()
})
