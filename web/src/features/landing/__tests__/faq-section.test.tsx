import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FaqSection } from '../components/faq-section'
import { FAQ_ITEMS } from '../content'

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: { faq_enabled: true, faq: [] } }),
}))

afterEach(() => {
  cleanup()
})

describe('FaqSection', () => {
  it('lists the built-in questions and expands an answer on click', () => {
    render(<FaqSection />)

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Frequently asked questions',
      })
    ).toBeInTheDocument()
    const triggers = screen.getAllByRole('button')
    expect(triggers.map((button) => button.textContent)).toEqual(
      FAQ_ITEMS.map((item) => item.question)
    )

    const last = screen.getByRole('button', {
      name: 'How do employees check their own usage?',
    })
    expect(last).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(last)
    expect(last).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'API key usage' })).toHaveAttribute(
      'href',
      '/key-usage'
    )
  })
})
