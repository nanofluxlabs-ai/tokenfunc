import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SelfCheckDemo } from '../components/demos/self-check-demo'
import { SELF_CHECK_TIMING } from '../content'

const originalMatchMedia = window.matchMedia

function mockReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

function summary() {
  return document.querySelector('[aria-live="polite"]')?.textContent
}

function selectedTab() {
  return screen.getByRole('tab', { selected: true }).textContent
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

describe('SelfCheckDemo', () => {
  it('lights up four steps, holds, then rotates to the next vendor', () => {
    mockReducedMotion(false)
    render(<SelfCheckDemo />)
    expect(selectedTab()).toBe('Claude')
    expect(summary()).toBe('claude-sonnet-5-5 · Checking 0/4')

    act(() => vi.advanceTimersByTime(SELF_CHECK_TIMING.step * 4))
    expect(summary()).toBe('claude-sonnet-5-5 · 4/4 passed')

    act(() => vi.advanceTimersByTime(SELF_CHECK_TIMING.hold - 1))
    expect(selectedTab()).toBe('Claude')
    act(() => vi.advanceTimersByTime(1))
    expect(selectedTab()).toBe('GPT')
    expect(summary()).toBe('gpt-6.2-sol · Checking 0/4')
  })

  it('restarts the check from the clicked vendor tab', () => {
    mockReducedMotion(false)
    render(<SelfCheckDemo />)
    act(() => vi.advanceTimersByTime(SELF_CHECK_TIMING.step * 2))
    expect(summary()).toBe('claude-sonnet-5-5 · Checking 2/4')

    fireEvent.click(screen.getByRole('tab', { name: 'Gemini' }))
    expect(selectedTab()).toBe('Gemini')
    expect(summary()).toBe('gemini-3.8-flash · Checking 0/4')
  })

  it('shows all checks passed and does not rotate when reduced motion is preferred', () => {
    mockReducedMotion(true)
    render(<SelfCheckDemo />)
    expect(summary()).toBe('claude-sonnet-5-5 · 4/4 passed')

    act(() => vi.advanceTimersByTime(60_000))
    expect(selectedTab()).toBe('Claude')
  })

  it('keeps the vendor tabs on a single scrollable row', () => {
    mockReducedMotion(true)
    render(<SelfCheckDemo />)
    const tablist = screen.getByRole('tablist')
    expect(tablist).toHaveClass('flex-nowrap', 'overflow-x-auto')
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveClass('whitespace-nowrap')
    }
  })
})
