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

import { useDocsNavStore } from '@/stores/docs-nav-store'

import { DocsNavList } from '../components/docs-nav-list'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode; className?: string }) => (
    <a href='#' className={props.className}>
      {props.children}
    </a>
  ),
}))

beforeEach(() => {
  useDocsNavStore.setState({ collapsed: [] })
})

afterEach(cleanup)

describe('DocsNavList', () => {
  it('collapses and expands a group from its header', () => {
    render(<DocsNavList lang='zh' activeSlug='quick-start' />)
    const toolsHeader = screen.getByRole('button', { name: '三方工具接入' })
    expect(toolsHeader).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Cursor')).toBeInTheDocument()

    fireEvent.click(toolsHeader)

    expect(toolsHeader).toHaveAttribute('aria-expanded', 'false')
    expect(useDocsNavStore.getState().collapsed).toEqual(['tools'])

    fireEvent.click(toolsHeader)
    expect(toolsHeader).toHaveAttribute('aria-expanded', 'true')
  })

  it('gives every tool page an icon and leaves other groups without one', () => {
    const { container } = render(
      <DocsNavList lang='zh' activeSlug='quick-start' />
    )
    const linkFor = (text: string) => screen.getByText(text).closest('a')
    // 工具组整组带图标位（包括没有品牌的「选择接入方式」），文字保持对齐
    for (const title of ['选择接入方式', 'Claude Code', 'Cursor', 'Pi']) {
      expect(
        linkFor(title)?.querySelector('[data-slot="docs-nav-icon"]')
      ).not.toBeNull()
    }
    expect(
      linkFor('快速开始')?.querySelector('[data-slot="docs-nav-icon"]')
    ).toBeNull()
    expect(
      container.querySelectorAll('[data-slot="docs-nav-icon"]')
    ).toHaveLength(12)
  })

  it('lists Responses right after Chat Completions in the API group', () => {
    render(<DocsNavList lang='en' activeSlug='quick-start' />)
    const titles = screen.getAllByRole('link').map((link) => link.textContent)
    const chat = titles.indexOf('Chat Completions')
    expect(titles[chat + 1]).toBe('Responses')
  })

  it('re-opens the group of the current page when it was collapsed', () => {
    useDocsNavStore.setState({ collapsed: ['tools', 'api'] })
    render(<DocsNavList lang='en' activeSlug='tools-cursor' />)

    expect(
      screen.getByRole('button', { name: 'Tool integration' })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('button', { name: 'API reference' })
    ).toHaveAttribute('aria-expanded', 'false')
  })
})
