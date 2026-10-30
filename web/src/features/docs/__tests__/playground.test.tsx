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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import { EndpointBar } from '../components/endpoint-bar'
import {
  PLAYGROUND_OPERATIONS,
  buildPlaygroundSpec,
} from '../lib/playground-spec'

const FAMILY_MODELS = {
  claude: 'claude-sonnet-5',
  gpt: 'gpt-5',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.5-pro',
  image: 'gpt-image-1',
}

const clientProps = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode }) => <a href='#'>{props.children}</a>,
}))
vi.mock('../hooks/use-docs-sample-key', () => ({
  useDocsSampleKey: () => ({ missing: false, loading: false }),
}))
vi.mock('../hooks/use-docs-base-url', () => ({
  useDocsBaseUrl: () => 'https://api.example.com',
}))
vi.mock('../hooks/use-docs-variables', () => ({
  useDocsFamilyModels: () => FAMILY_MODELS,
  useDocsVariables: () => ({ siteName: 'Acme' }),
}))
// Scalar 本身依赖浏览器里的 Vue 应用，这里只验证传给它的参数
vi.mock('../components/api-playground-client', () => ({
  default: (props: Record<string, unknown>) => {
    clientProps(props)
    return null
  },
}))

beforeEach(() => {
  useAuthStore.setState((state) => ({
    auth: { ...state.auth, user: { id: 1, username: 'carol' } as never },
  }))
  useDocsSampleStore.setState({
    key: { id: 7, name: 'default', value: 'sk-real' },
  })
})

afterEach(() => {
  cleanup()
  clientProps.mockReset()
})

describe('buildPlaygroundSpec', () => {
  it('describes every operation the docs can open, with this site’s models', () => {
    const spec = buildPlaygroundSpec('Acme', FAMILY_MODELS) as {
      paths: Record<string, Record<string, { operationId: string }>>
    }
    for (const [id, target] of Object.entries(PLAYGROUND_OPERATIONS)) {
      expect(spec.paths[target.path]?.[target.method]?.operationId).toBe(id)
    }
    const text = JSON.stringify(spec)
    expect(text).toContain('"model":"gpt-5"')
    expect(text).toContain('"model":"claude-sonnet-5"')
    expect(text).toContain('"default":"gemini-2.5-pro"')
  })
})

describe('EndpointBar', () => {
  it('shows the method and the full address with the path', () => {
    render(
      <EndpointBar method='POST' path='/v1/messages' operation='messages' />
    )
    expect(screen.getByText('POST')).toBeInTheDocument()
    expect(screen.getByRole('code')).toHaveTextContent(
      'https://api.example.com/v1/messages'
    )
  })

  it('hides the playground button when the operation is unknown', () => {
    render(<EndpointBar method='GET' path='/v1/other' operation='nope' />)
    expect(screen.queryByRole('button', { name: 'Try it online' })).toBeNull()
  })

  it('loads the playground only after the first click and passes the key and endpoint', async () => {
    render(
      <EndpointBar method='POST' path='/v1/messages' operation='messages' />
    )
    expect(clientProps).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Try it online' }))

    await vi.waitFor(() => expect(clientProps).toHaveBeenCalled())
    expect(clientProps.mock.lastCall?.[0]).toMatchObject({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-real',
      operation: 'messages',
      openCount: 1,
    })
  })

  it('asks visitors to sign in and keeps the button disabled', () => {
    useAuthStore.setState((state) => ({ auth: { ...state.auth, user: null } }))
    useDocsSampleStore.setState({ key: null })
    render(
      <EndpointBar
        method='POST'
        path='/v1/chat/completions'
        operation='chat-completions'
      />
    )

    expect(
      screen.getByText('Sign in to try this endpoint online.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try it online' })).toBeDisabled()
  })
})
