import { zodResolver } from '@hookform/resolvers/zod'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { SettingsPageProvider } from '../../../components/settings-page-context'
import { positiveIntegerSchema } from '../../../utils/numeric-field'
import { ChannelGroupsForm, type GroupFormValues } from '../channel-groups-form'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode; className?: string }) => (
    <a href='#' className={props.className}>
      {props.children}
    </a>
  ),
}))

const getChannels = vi.fn()
vi.mock('@/features/channels/api', () => ({
  getChannels: (...args: unknown[]) => getChannels(...args),
}))

// 段二是用户管理模块自带数据与保存的面板，这里只验证挂载，不测其内部
vi.mock('@/features/users/groups', () => ({
  UserGroupPricingPanel: () => <div data-testid='user-group-pricing-panel' />,
}))

const defaults: GroupFormValues = {
  GroupRatio: '{"default":1,"vip":0.8}',
  TopupGroupRatio: '{"vip":1.2}',
  UserUsableGroups: '{"default":"Standard access","vip":"Premium access"}',
  GroupGroupRatio: '{"ent_std":{"vip":0.5}}',
  AutoGroups: '["default","vip"]',
  MaxTokenAutoGroups: 5,
  DefaultUseAutoGroup: false,
  GroupSpecialUsableGroup: '{"ent_std":{"+:vip":"Premium"}}',
  ChannelGroupsRegistry:
    '{"default":{"label":"Standard access","order":0},"vip":{"label":"Premium access","order":1}}',
}

const schema = z.object({
  GroupRatio: z.string(),
  TopupGroupRatio: z.string(),
  UserUsableGroups: z.string(),
  GroupGroupRatio: z.string(),
  AutoGroups: z.string(),
  MaxTokenAutoGroups: positiveIntegerSchema('Enter a positive integer'),
  DefaultUseAutoGroup: z.boolean(),
  GroupSpecialUsableGroup: z.string(),
  ChannelGroupsRegistry: z.string(),
})

let client: QueryClient

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  getChannels.mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 1000 },
  })
})

afterEach(() => {
  client.clear()
  getChannels.mockReset()
})

function Fixture(props: {
  onSave?: (values: GroupFormValues) => Promise<void>
  initial?: Partial<GroupFormValues>
}) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const form = useForm<GroupFormValues>({
    defaultValues: { ...defaults, ...props.initial },
    resolver: zodResolver(schema),
  })
  return (
    <QueryClientProvider client={client}>
      <SettingsPageProvider actionsContainer={actions}>
        <div ref={setActions} />
        <ChannelGroupsForm
          form={form}
          onSave={props.onSave ?? (async () => {})}
          isSaving={false}
        />
      </SettingsPageProvider>
    </QueryClientProvider>
  )
}

function rowByKey(key: string) {
  const list = screen.getByRole('list', { name: 'Channel groups' })
  const item = within(list)
    .getAllByRole('listitem')
    .find((element) => element.textContent?.includes(key))
  if (!item) throw new Error(`row ${key} not found`)
  return item
}

describe('channel groups editor', () => {
  it('lists the configured groups with labelled controls on every row', () => {
    render(<Fixture />)
    const list = screen.getByRole('list', { name: 'Channel groups' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(
      within(rowByKey('vip')).getByRole('textbox', { name: 'Name' })
    ).toHaveValue('Premium access')
    expect(
      within(rowByKey('vip')).getByRole('spinbutton', { name: 'Top-up ratio' })
    ).toHaveValue(1.2)
    expect(
      within(rowByKey('vip')).queryByRole('switch')
    ).not.toBeInTheDocument()
    expect(
      within(rowByKey('default')).getByRole('button', {
        name: 'Remove default',
      })
    ).toBeDisabled()
  })

  it('blocks saving until a new row has a valid unique key and then saves it', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_values: GroupFormValues) => {})
    render(<Fixture onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Add channel group' }))
    const save = screen.getByRole('button', { name: 'Save group settings' })
    const keyInput = screen.getByRole('textbox', { name: 'Group key' })
    expect(keyInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Fix invalid group keys before saving.'
    )
    expect(save).toBeDisabled()

    await user.type(keyInput, 'Vip')
    expect(
      screen.getByText('Use lowercase letters, digits, underscore or hyphen')
    ).toBeVisible()
    await user.clear(keyInput)
    await user.type(keyInput, 'vip')
    expect(screen.getByText('Duplicate group key')).toBeVisible()
    await user.clear(keyInput)
    await user.type(keyInput, 'claude-pool')
    expect(keyInput).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(save).toBeEnabled()

    await user.click(save)
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[0][0]
    expect(JSON.parse(saved.GroupRatio)).toEqual({
      default: 1,
      vip: 0.8,
      'claude-pool': 1,
    })
    expect(saved.UserUsableGroups).toBe(defaults.UserUsableGroups)
    expect(JSON.parse(saved.ChannelGroupsRegistry)['claude-pool']).toEqual({
      label: 'claude-pool',
      order: 2,
    })
  })

  it('asks for confirmation with the channel usage count and cascades the deletion', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_values: GroupFormValues) => {})
    getChannels.mockResolvedValue({
      success: true,
      data: {
        items: [
          { id: 1, group: 'vip,default' },
          { id: 2, group: 'default' },
          { id: 3, group: 'vip' },
        ],
        total: 3,
        page: 1,
        page_size: 1000,
      },
    })
    render(<Fixture onSave={onSave} />)

    await user.click(
      within(rowByKey('vip')).getByRole('button', { name: 'Remove vip' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Delete channel group vip?')
    expect(
      await within(dialog).findByText('2 channels still use this group.')
    ).toBeVisible()
    expect(getChannels).toHaveBeenCalledWith({ p: 1, page_size: 1000 })

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    expect(
      within(screen.getByRole('list', { name: 'Channel groups' })).getAllByRole(
        'listitem'
      )
    ).toHaveLength(1)

    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[0][0]
    expect(JSON.parse(saved.GroupRatio)).toEqual({ default: 1 })
    expect(JSON.parse(saved.TopupGroupRatio)).toEqual({})
    expect(JSON.parse(saved.UserUsableGroups)).toEqual({
      default: 'Standard access',
    })
    expect(JSON.parse(saved.AutoGroups)).toEqual(['default'])
    expect(JSON.parse(saved.GroupGroupRatio)).toEqual({ ent_std: {} })
    expect(JSON.parse(saved.GroupSpecialUsableGroup)).toEqual({ ent_std: {} })
    expect(JSON.parse(saved.ChannelGroupsRegistry)).toEqual({
      default: { label: 'Standard access', order: 0 },
    })
  })

  it('omits the channel count when the channel list is paginated beyond one page', async () => {
    const user = userEvent.setup()
    getChannels.mockResolvedValue({
      success: true,
      data: {
        items: [{ id: 1, group: 'vip' }],
        total: 1500,
        page: 1,
        page_size: 1000,
      },
    })
    render(<Fixture />)

    await user.click(
      within(rowByKey('vip')).getByRole('button', { name: 'Remove vip' })
    )
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(getChannels).toHaveBeenCalled())
    expect(
      within(dialog).getByText(
        'Make sure no channel or API key still uses this group before deleting.'
      )
    ).toBeVisible()
    expect(dialog).not.toHaveTextContent('still use this group.')
  })

  it('reorders rows from the drag handle with arrow keys and renumbers the registry', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_values: GroupFormValues) => {})
    render(<Fixture onSave={onSave} />)

    const handle = within(rowByKey('vip')).getByRole('button', {
      name: 'Drag vip to reorder',
    })
    handle.focus()
    await user.keyboard('{ArrowUp}')
    const list = screen.getByRole('list', { name: 'Channel groups' })
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('vip')

    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[0][0]
    expect(JSON.parse(saved.ChannelGroupsRegistry)).toEqual({
      vip: { label: 'Premium access', order: 0 },
      default: { label: 'Standard access', order: 1 },
    })
    expect(Object.keys(JSON.parse(saved.GroupRatio))).toEqual([
      'default',
      'vip',
    ])
  })

  it('mounts the user group pricing panel below the channel groups with a single save button', () => {
    render(<Fixture />)

    expect(
      screen.getAllByRole('button', { name: 'Save group settings' })
    ).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: 'Advanced editor' })
    ).not.toBeInTheDocument()
    const channelGroups = screen.getByRole('list', { name: 'Channel groups' })
    const panel = screen.getByTestId('user-group-pricing-panel')
    expect(
      channelGroups.compareDocumentPosition(panel) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('invalidates the group registry cache after a successful save', async () => {
    const user = userEvent.setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    render(<Fixture />)

    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['tokenfunc-groups'],
      })
    )
  })

  it('keeps move, drag and remove controls of a channel group row in one trailing action group', () => {
    render(<Fixture />)
    const row = rowByKey('vip')

    const actions = within(row)
      .getByRole('button', { name: 'Move vip up' })
      .closest('[data-slot="row-actions"]')
    expect(actions).not.toBeNull()
    expect(
      within(actions as HTMLElement)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Move vip up',
      'Move vip down',
      'Drag vip to reorder',
      'Remove vip',
    ])
    // 操作组是行内最后一个子元素，字段区在它前面
    expect(row.lastElementChild).toBe(actions)
    expect(
      within(row)
        .getByRole('textbox', { name: 'Name' })
        .compareDocumentPosition(actions as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('keeps move, drag and remove controls of an auto group row in one trailing action group', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    await user.click(screen.getByRole('button', { name: /Auto group order/ }))

    const list = screen.getByRole('list', { name: 'Auto group order' })
    const row = within(list)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.includes('vip'))
    if (!row) throw new Error('auto group row vip not found')
    expect(within(row).getByText('Ratio 0.8')).toBeVisible()

    const actions = within(row)
      .getByRole('button', { name: 'Move vip up' })
      .closest('[data-slot="row-actions"]')
    expect(actions).not.toBeNull()
    expect(
      within(actions as HTMLElement)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Move vip up',
      'Move vip down',
      'Drag vip to reorder',
      'Remove vip',
    ])
    expect(row.lastElementChild).toBe(actions)
  })
})
