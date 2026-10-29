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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import { ConnectionCheck } from '../components/connection-check'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode }) => <a href='#'>{props.children}</a>,
  useSearch: () => ({ tool: 'claude-code' }),
}))
vi.mock('../hooks/use-docs-sample-key', () => ({
  useDocsSampleKey: () => ({ missing: false, loading: false }),
}))
vi.mock('../hooks/use-docs-base-url', () => ({
  useDocsBaseUrl: () => 'https://api.example.com',
}))
vi.mock('../hooks/use-docs-variables', () => ({
  useDocsModelOptions: () => ['claude-sonnet-5'],
  useDocsFamilyModels: () => ({
    claude: 'claude-sonnet-5',
    gpt: 'gpt-5',
    deepseek: 'deepseek-chat',
    gemini: 'gemini-2.5-pro',
    image: 'gpt-image-1',
  }),
}))

const fetchMock = vi.fn()

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore.setState((state) => ({
    auth: { ...state.auth, user: { id: 1, username: 'carol' } as never },
  }))
  useDocsSampleStore.setState({
    key: { id: 7, name: 'default', value: 'sk-real' },
  })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('ConnectionCheck', () => {
  it('flags an extra /v1 for Claude Code and passes the remaining steps', async () => {
    fetchMock
      .mockImplementationOnce(() =>
        json(200, { data: [{ id: 'claude-sonnet-5' }] })
      )
      .mockImplementationOnce(() => json(200, { id: 'msg_1', content: [] }))
    render(<ConnectionCheck />)

    fireEvent.change(screen.getByLabelText('Address you entered in the tool'), {
      target: { value: 'https://api.example.com/v1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run check' }))

    expect(
      await screen.findByText(
        'The model replied. These settings work in Claude Code.'
      )
    ).toBeInTheDocument()
    expect(
      // 测试环境的 i18next 会转义插值里的斜杠，只比对固定文案部分
      screen.getByText(
        /^Claude Code adds \/v1 by itself\. Remove \/v1 from the end:/
      )
    ).toBeInTheDocument()

    const [modelsUrl, modelsInit] = fetchMock.mock.calls[0]
    expect(modelsUrl).toBe('https://api.example.com/v1/models')
    expect(modelsInit.headers).toEqual({ Authorization: 'Bearer sk-real' })
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.example.com/v1/messages'
    )
  })

  it('stops before the paid call when the key cannot use the model', async () => {
    fetchMock.mockImplementationOnce(() =>
      json(200, { data: [{ id: 'gpt-5' }] })
    )
    render(<ConnectionCheck />)

    fireEvent.click(screen.getByRole('button', { name: 'Run check' }))

    expect(
      await screen.findByText(
        'claude-sonnet-5 is not available to your key. Check the model name, the key group and its model limits. Models your key can use: gpt-5'
      )
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Run check' })).toBeEnabled()
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('explains an insufficient balance returned by the test request', async () => {
    fetchMock
      .mockImplementationOnce(() =>
        json(200, { data: [{ id: 'claude-sonnet-5' }] })
      )
      .mockImplementationOnce(() =>
        json(403, {
          error: {
            code: 'insufficient_user_quota',
            message: 'quota exhausted',
          },
        })
      )
    render(<ConnectionCheck />)

    fireEvent.click(screen.getByRole('button', { name: 'Run check' }))

    expect(
      await screen.findByText(
        'Your balance or the key quota is not enough. Top up or raise the key quota: quota exhausted'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('Open the Claude Code guide')).toBeInTheDocument()
  })

  it('asks visitors to sign in instead of running the check', () => {
    useAuthStore.setState((state) => ({ auth: { ...state.auth, user: null } }))
    useDocsSampleStore.setState({ key: null })
    render(<ConnectionCheck />)

    expect(
      screen.getByText('Sign in to run the check with your key.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run check' })).toBeDisabled()
  })
})
