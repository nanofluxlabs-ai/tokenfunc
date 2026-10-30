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
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DocsLayout } from '../components/docs-layout'

vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children: ReactNode }) => <div>{props.children}</div>,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode }) => <a href='#'>{props.children}</a>,
}))
// 侧栏本身另有测试，这里只需要一个能触发 onNavigate 的入口
vi.mock('../components/docs-nav-list', () => ({
  DocsNavList: (props: { onNavigate?: () => void }) => (
    <button type='button' onClick={props.onNavigate}>
      go-to-page
    </button>
  ),
}))

const scrollTo = vi.fn()

beforeEach(() => {
  vi.stubGlobal('scrollTo', scrollTo)
})

afterEach(() => {
  cleanup()
  scrollTo.mockReset()
  vi.unstubAllGlobals()
})

function renderLayout() {
  return render(
    <DocsLayout slug='api-gemini' lang='zh' headings={[]}>
      <p>body</p>
    </DocsLayout>
  )
}

describe('DocsLayout mobile page menu', () => {
  it('scrolls the new page to the top once the drawer has closed after navigating', async () => {
    renderLayout()
    fireEvent.click(screen.getByRole('button', { name: 'Docs pages' }))
    // 桌面侧栏与抽屉里各有一个入口，点抽屉里的那个
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'go-to-page' }))

    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0 }))
  })

  it('keeps the scroll position when the drawer is closed without navigating', async () => {
    renderLayout()
    fireEvent.click(screen.getByRole('button', { name: 'Docs pages' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
