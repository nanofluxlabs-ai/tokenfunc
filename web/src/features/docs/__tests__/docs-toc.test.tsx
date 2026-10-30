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

import { DocsToc } from '../components/docs-toc'
import type { DocHeading } from '../lib/doc-markdown'

const HEADINGS: DocHeading[] = [
  { id: 'request', text: 'Request', level: 2 },
  { id: 'params', text: 'Parameters', level: 3 },
  { id: 'response', text: 'Response', level: 2 },
]

/** 在页面中放入标题元素，并指定它们相对视口顶部的位置 */
function placeHeadings(tops: Record<string, number>) {
  for (const [id, top] of Object.entries(tops)) {
    let el = document.getElementById(id)
    if (!el) {
      el = document.createElement('h2')
      el.id = id
      document.body.appendChild(el)
    }
    el.getBoundingClientRect = () => ({ top }) as DOMRect
  }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('DocsToc', () => {
  it('renders nothing when the page has fewer than two headings', () => {
    render(<DocsToc headings={HEADINGS.slice(0, 1)} />)
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('links every heading to its anchor and marks the first as current before scrolling', () => {
    placeHeadings({ request: 300, params: 600, response: 900 })
    render(<DocsToc headings={HEADINGS} />)

    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(nav).toBeInTheDocument()
    for (const heading of HEADINGS) {
      expect(screen.getByRole('link', { name: heading.text })).toHaveAttribute(
        'href',
        `#${heading.id}`
      )
    }
    expect(screen.getByRole('link', { name: 'Request' })).toHaveAttribute(
      'aria-current',
      'location'
    )
  })

  it('moves the current marker to the last heading scrolled past the top', async () => {
    placeHeadings({ request: 300, params: 600, response: 900 })
    render(<DocsToc headings={HEADINGS} />)

    placeHeadings({ request: -500, params: 40, response: 400 })
    fireEvent.scroll(window)

    await vi.waitFor(() =>
      expect(screen.getByRole('link', { name: 'Parameters' })).toHaveAttribute(
        'aria-current',
        'location'
      )
    )
    expect(screen.getByRole('link', { name: 'Request' })).not.toHaveAttribute(
      'aria-current'
    )
  })
})
