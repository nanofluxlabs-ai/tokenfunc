import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ContactSalesFab } from '../contact-sales-fab'

const state = vi.hoisted(() => ({
  pathname: '/',
  status: {} as { sales_qrcode?: string; sales_telegram?: string },
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: (options: {
    select: (location: { pathname: string }) => string
  }) => options.select({ pathname: state.pathname }),
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: state.status, loading: false, error: null }),
}))

const QRCODE = 'https://example.com/sales.png'

beforeEach(() => {
  state.pathname = '/'
  state.status = {}
})
afterEach(cleanup)

describe('ContactSalesFab', () => {
  test('renders nothing when neither contact is configured', () => {
    render(<ContactSalesFab />)
    expect(screen.queryByRole('button', { name: 'Contact sales' })).toBeNull()
  })

  test('is hidden on chat and playground pages', () => {
    state.status = { sales_qrcode: QRCODE, sales_telegram: 'foo' }
    for (const pathname of ['/playground', '/chat/abc', '/chat2link']) {
      state.pathname = pathname
      const { unmount } = render(<ContactSalesFab />)
      expect(screen.queryByRole('button', { name: 'Contact sales' })).toBeNull()
      unmount()
    }
  })

  test('shows the WeChat QR code without tabs when only WeChat is configured', async () => {
    state.status = { sales_qrcode: QRCODE }
    render(<ContactSalesFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Contact sales' }))
    expect(await screen.findByAltText('Sales WeChat QR code')).toHaveProperty(
      'src',
      QRCODE
    )
    expect(screen.queryByRole('tab')).toBeNull()
  })

  test('offers WeChat and Telegram tabs with a t.me link when both are configured', async () => {
    state.status = { sales_qrcode: QRCODE, sales_telegram: 'foo' }
    render(<ContactSalesFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Contact sales' }))
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['WeChat', 'Telegram'])
    await userEvent.click(tabs[1])
    const link = await screen.findByRole('link', { name: /Open Telegram/ })
    expect(link.getAttribute('href')).toBe('https://t.me/foo')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
