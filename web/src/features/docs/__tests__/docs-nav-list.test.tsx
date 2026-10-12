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
/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocsNavList } from '../components/docs-nav-list'
import { DOCS_SLUGS } from '../registry'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    'aria-current'?: 'page'
    className?: string
  }) => (
    <a
      href={props.to.replace('$slug', props.params?.slug ?? '')}
      aria-current={props['aria-current']}
      className={props.className}
    >
      {props.children}
    </a>
  ),
}))

afterEach(cleanup)

describe('DocsNavList', () => {
  it('renders a link for every registered docs page with the right href', () => {
    render(<DocsNavList activeSlug='api-models' />)

    const hrefs = new Set(
      screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    )
    for (const slug of DOCS_SLUGS) {
      expect(hrefs.has(`/docs/${slug}`), slug).toBe(true)
    }
  })

  it('renders the three group headings', () => {
    render(<DocsNavList />)

    // 'Quick start' is both the group heading and its single page title.
    expect(screen.getAllByText('Quick start')).toHaveLength(2)
    expect(screen.getByText('Model access API')).toBeInTheDocument()
    expect(screen.getByText('Third-party tool integration')).toBeInTheDocument()
  })

  it('marks exactly the active page with aria-current', () => {
    render(<DocsNavList activeSlug='api-chat-completions' />)

    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('href', '/docs/api-chat-completions')
  })

  it('marks nothing active without an activeSlug', () => {
    render(<DocsNavList />)

    const current = screen
      .getAllByRole('link')
      .filter((link) => link.hasAttribute('aria-current'))
    expect(current).toHaveLength(0)
  })
})
