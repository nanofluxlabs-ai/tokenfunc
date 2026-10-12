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
import type { Row } from '@tanstack/react-table'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { CHANNEL_TYPE_CODEX } from '../../constants'
import { channelSchema, type Channel } from '../../types'
import { ChannelsProvider, useChannels } from '../channels-provider'
import { DataTableRowActions } from '../data-table-row-actions'
import { ChannelTestDialog } from '../dialogs/channel-test-dialog'

const originalAuth = useAuthStore.getState().auth
let client: QueryClient

function channel(type: number): Channel {
  return channelSchema.parse({
    id: 42,
    type,
    key: '',
    name: 'probe',
    status: 1,
    created_time: 0,
    test_time: 0,
    response_time: 0,
    balance_updated_time: 0,
  })
}

function TestDialogHarness(props: { channel: Channel }) {
  const { currentRow, setCurrentRow } = useChannels()
  useEffect(() => {
    setCurrentRow(props.channel)
  }, [props.channel, setCurrentRow])
  if (!currentRow) return null
  return <ChannelTestDialog open onOpenChange={() => {}} />
}

function renderWithProviders(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={client}>
      <ChannelsProvider>{ui}</ChannelsProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.setState({
    auth: {
      ...originalAuth,
      user: { id: 1, username: 'root', role: ROLE.SUPER_ADMIN },
    },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState({ auth: originalAuth })
})

describe('channel test stream default', () => {
  it('turns stream mode on by default in the test dialog for a Codex channel', async () => {
    renderWithProviders(
      <TestDialogHarness channel={channel(CHANNEL_TYPE_CODEX)} />
    )

    expect(
      await screen.findByRole('switch', { name: 'Stream Mode' })
    ).toBeChecked()
  })

  it('keeps stream mode off by default in the test dialog for an OpenAI channel', async () => {
    renderWithProviders(<TestDialogHarness channel={channel(1)} />)

    expect(
      await screen.findByRole('switch', { name: 'Stream Mode' })
    ).not.toBeChecked()
  })

  it('still lets the user turn stream mode off for a Codex channel', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <TestDialogHarness channel={channel(CHANNEL_TYPE_CODEX)} />
    )
    const toggle = await screen.findByRole('switch', { name: 'Stream Mode' })

    await user.click(toggle)

    expect(toggle).not.toBeChecked()
  })

  it('sends stream=true from the row test button for a Codex channel', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: { success: true, data: {} } })
    const user = userEvent.setup()
    const row = { original: channel(CHANNEL_TYPE_CODEX) } as Row<Channel>
    renderWithProviders(<DataTableRowActions row={row} />)

    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    await waitFor(() => expect(get).toHaveBeenCalledOnce())
    expect(get).toHaveBeenCalledWith(
      '/api/channel/test/42',
      expect.objectContaining({ params: { stream: true } })
    )
  })

  it('sends no stream flag from the row test button for an OpenAI channel', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: { success: true, data: {} } })
    const user = userEvent.setup()
    const row = { original: channel(1) } as Row<Channel>
    renderWithProviders(<DataTableRowActions row={row} />)

    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    await waitFor(() => expect(get).toHaveBeenCalledOnce())
    expect(get.mock.calls[0][1]?.params).toBeUndefined()
  })
})
