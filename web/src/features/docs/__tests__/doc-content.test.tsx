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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocContent } from '../components/doc-content'
import { parseDoc } from '../lib/doc-markdown'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
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
