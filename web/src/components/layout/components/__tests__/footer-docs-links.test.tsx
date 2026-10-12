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

import { Hero } from '@/features/home/components/sections/hero'

import { Footer } from '../footer'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    className?: string
  }) => (
    <a
      href={props.to.replace('$slug', props.params?.slug ?? '')}
      className={props.className}
    >
      {props.children}
    </a>
  ),
}))

const systemConfig = vi.hoisted(() => ({
  systemName: 'tokenfunc',
  logo: '/logo.png',
  footerHtml: '',
  demoSiteEnabled: false,
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => systemConfig,
}))

const siteStatus = vi.hoisted(() => ({
  user_agreement_enabled: false,
  privacy_policy_enabled: false,
  docs_link: undefined as string | undefined,
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: siteStatus }),
}))

afterEach(() => {
  cleanup()
  siteStatus.docs_link = undefined
  systemConfig.demoSiteEnabled = false
})

function linkHrefs() {
  return [...document.querySelectorAll('a')].map(
    (anchor) => anchor.getAttribute('href') ?? ''
  )
}

describe('Footer docs column', () => {
  it('links to the in-site docs pages instead of the upstream docs site', () => {
    systemConfig.demoSiteEnabled = true

    render(<Footer />)

    const docsLinks = [
      'footer.columns.docs.links.quickStart',
      'footer.columns.docs.links.apiDocs',
      'footer.columns.docs.links.toolIntegration',
    ].map((text) => {
      const label = screen.getByText(text)
      return label.closest('a')?.getAttribute('href') ?? ''
    })
    expect(docsLinks).toEqual([
      '/docs',
      '/docs/api-chat-completions',
      '/docs/tools-claude-code',
    ])
  })
})

describe('Hero docs button', () => {
  it('routes to the in-site docs page when no docs link is configured', () => {
    render(<Hero />)

    const hrefs = linkHrefs()
    expect(hrefs).toContain('/docs')
    expect(hrefs).not.toContain('https://docs.newapi.pro')
  })

  it('keeps honoring an externally configured docs link', () => {
    siteStatus.docs_link = 'https://external.example.com/docs'

    render(<Hero />)

    const hrefs = linkHrefs()
    expect(hrefs).toContain('https://external.example.com/docs')
    expect(hrefs).not.toContain('/docs')
  })
})
