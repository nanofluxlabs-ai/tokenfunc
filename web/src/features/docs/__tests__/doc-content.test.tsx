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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocContent } from '../components/doc-content'
import { parseDoc } from '../lib/doc-markdown'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
  Link: (props: { children: ReactNode }) => <a href='#'>{props.children}</a>,
}))
vi.mock('../hooks/use-docs-variables', () => ({
  useDocsModelOptions: () => ['gpt-5'],
  useDocsFamilyModels: () => ({ gpt: 'gpt-5' }),
}))
const copyToClipboard = vi.fn(async (_text: string) => true)
vi.mock('@/lib/copy-to-clipboard', () => ({
  copyToClipboard: (text: string) => copyToClipboard(text),
}))
vi.mock('../hooks/use-docs-sample-key', () => ({
  useDocsSampleKey: () => ({ missing: false, loading: false }),
}))

afterEach(() => {
  cleanup()
  navigate.mockReset()
})

const vars = { baseUrl: 'https://api.example.com', apiKey: 'sk-real-key' }

function renderDoc(source: string) {
  return render(
    <DocContent blocks={parseDoc(source, 'zh').blocks} vars={vars} />
  )
}

const API_EXAMPLES = [
  ':::request-example',
  '@tab cURL',
  '```bash',
  'curl {{baseUrl}}/v1/chat/completions',
  '```',
  ':::',
  ':::response-example',
  '@tab 200',
  '```json',
  '{"id": "chatcmpl-1"}',
  '```',
  ':::',
].join('\n')

describe('DocContent API examples', () => {
  it('puts the sample model picker above the request example and the key hint below it', () => {
    render(
      <DocContent
        blocks={parseDoc(API_EXAMPLES, 'zh').blocks}
        vars={vars}
        sampleFamily='gpt'
      />
    )
    // 只有请求示例带模型选择，响应示例不带
    const pickers = screen.getAllByText('Model in samples')
    expect(pickers).toHaveLength(1)
    const code = screen.getByText(/curl https:\/\/api\.example\.com/)
    const hint = screen.getByText(
      'Sign in to fill the samples with your own key.'
    )
    expect(
      pickers[0].compareDocumentPosition(code) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      code.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('shows no model picker when the page has no sample model family', () => {
    render(
      <DocContent blocks={parseDoc(API_EXAMPLES, 'zh').blocks} vars={vars} />
    )
    expect(screen.queryByText('Model in samples')).toBeNull()
  })
})

describe('DocContent key masking', () => {
  it('shows the masked key on the page but copies the real key', async () => {
    const source = ['```bash', 'curl -H "Bearer {{apiKey}}"', '```'].join('\n')
    const { container } = render(
      <DocContent
        blocks={parseDoc(source, 'zh').blocks}
        vars={{ apiKey: 'sk-real****-key' }}
        copyVars={{ apiKey: 'sk-real-secret-key' }}
      />
    )
    expect(container.textContent).toContain('curl -H "Bearer sk-real****-key"')
    expect(container.textContent).not.toContain('sk-real-secret-key')

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    await vi.waitFor(() =>
      expect(copyToClipboard).toHaveBeenCalledWith(
        'curl -H "Bearer sk-real-secret-key"'
      )
    )
  })
})

describe('DocContent', () => {
  it('fills the selected key and base URL into code samples', () => {
    const { container } = renderDoc(
      ['```bash', 'curl {{baseUrl}} -H "Bearer {{apiKey}}"', '```'].join('\n')
    )
    expect(container.textContent).toContain(
      'curl https://api.example.com -H "Bearer sk-real-key"'
    )
  })

  it('switches every tab group with the same label when one tab is chosen', () => {
    const tabs = (body: string) =>
      [
        ':::tabs',
        '@tab macOS',
        `mac ${body}`,
        '@tab Windows',
        `win ${body}`,
        ':::',
      ].join('\n')
    renderDoc(`${tabs('install')}\n\n${tabs('config')}`)

    expect(screen.getByText('mac install')).toBeInTheDocument()
    expect(screen.getByText('mac config')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('tab', { name: 'Windows' })[0])

    expect(screen.getByText('win install')).toBeInTheDocument()
    expect(screen.getByText('win config')).toBeInTheDocument()
  })

  it('routes in-site links through the router and leaves external links alone', () => {
    renderDoc('[FAQ](/docs/faq) and [GitHub](https://github.com)')

    fireEvent.click(screen.getByRole('link', { name: 'FAQ' }))
    expect(navigate).toHaveBeenCalledWith({ href: '/docs/faq' })

    const external = screen.getByRole('link', { name: 'GitHub' })
    expect(external).toHaveAttribute('target', '_blank')
    fireEvent.click(external)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('shows screenshot placeholders with the description of the missing image', () => {
    renderDoc('![设置页的 API Keys 区域](todo:tools/cursor.png)')
    expect(
      screen.getByRole('img', { name: '设置页的 API Keys 区域' })
    ).toHaveTextContent('截图待补充')
  })
})
