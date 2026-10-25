import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import EnterpriseIntegrationPage from '../content/enterprise-integration'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; children?: unknown; className?: string }) => (
    <a href={props.to} className={props.className}>
      {props.children as never}
    </a>
  ),
}))
vi.mock('../hooks/use-docs-base-url', () => ({
  DOCS_API_KEY_ENV: 'TOKENFUNC_API_KEY',
  useDocsBaseUrl: () => 'https://api.example.com',
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      system_name: 'TokenFunc',
      sales_qrcode: 'https://cdn.example.com/qr.png',
    },
    loading: false,
    error: null,
  }),
}))

afterEach(cleanup)

describe('EnterpriseIntegrationPage', () => {
  it('renders every section in guide order', () => {
    render(<EnterpriseIntegrationPage />)

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual([
      'Teams, members and keys',
      'Issuing keys to employees',
      'Querying credit from code',
      'Employee self-check',
      'Identifying your end users',
      'Enterprise error codes',
      'Billing cycle',
      'Contact',
    ])
  })

  it('lists the six enterprise error codes with their HTTP status', () => {
    render(<EnterpriseIntegrationPage />)

    for (const code of [
      'insufficient_user_quota',
      'team_budget_exceeded',
      'credit_period_awaiting_payment',
      'enterprise_credit_not_enabled',
      'credit_period_not_found',
      'access_denied',
    ]) {
      expect(screen.getByText(code)).toBeInTheDocument()
    }
    expect(screen.getAllByText('403').length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it('shows curl samples against the configured base URL and the credit JSON sample', () => {
    const { container } = render(<EnterpriseIntegrationPage />)

    const text = container.textContent ?? ''
    expect(text).toContain(
      'curl https://api.example.com/v1/dashboard/billing/credit'
    )
    expect(text).toContain(
      'curl https://api.example.com/v1/enterprise/employee/me'
    )
    expect(text).toContain('"object": "billing_credit"')
    expect(text).toContain('"object": "enterprise_employee"')
    expect(text).toContain('"type": "request_header"')
  })

  it('uses the site name and sales QR code from status in the contact section', () => {
    render(<EnterpriseIntegrationPage />)

    expect(screen.getByText(/TokenFunc account manager/)).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Sales contact QR code' })
    ).toHaveAttribute('src', 'https://cdn.example.com/qr.png')
    expect(
      screen.getByRole('link', { name: 'Enterprise console' })
    ).toHaveAttribute('href', '/enterprise/overview')
  })
})
