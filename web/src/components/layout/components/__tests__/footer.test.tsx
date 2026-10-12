import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Footer } from '../footer'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={props.to} className={props.className}>
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
  user_agreement_enabled: true,
  privacy_policy_enabled: false,
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: siteStatus }),
}))

afterEach(() => {
  cleanup()
  systemConfig.footerHtml = ''
  systemConfig.demoSiteEnabled = false
})

describe('Footer brand and copyright area', () => {
  it('renders the logo link and the copyright line inside the same region', () => {
    render(<Footer />)

    const brandLink = screen.getByRole('link', { name: /tokenfunc/ })
    const year = new Date().getFullYear()

    expect(brandLink).toHaveAttribute('href', '/')
    expect(brandLink.parentElement).toHaveTextContent(
      `© ${year} tokenfunc. footer.defaultCopyright`
    )
  })

  it('does not render the upstream project attribution or the generic tagline', () => {
    render(<Footer />)

    expect(screen.queryByRole('link', { name: 'New API' })).toBeNull()
    expect(screen.queryByText(/projectAttributionSuffix/)).toBeNull()
    expect(screen.queryByText('Powerful API Management Platform')).toBeNull()
  })

  it('renders only the enabled legal links plus the About entry', () => {
    render(<Footer />)

    expect(
      screen.getByRole('link', { name: 'User Agreement' })
    ).toHaveAttribute('href', '/user-agreement')
    expect(screen.queryByRole('link', { name: 'Privacy Policy' })).toBeNull()
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'href',
      '/about'
    )
  })

  it('keeps the legal links and drops the attribution when a custom footer html is configured', () => {
    systemConfig.footerHtml = '<span>custom footer</span>'

    render(<Footer />)

    expect(screen.getByText('custom footer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New API' })).toBeNull()
  })
})
