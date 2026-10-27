import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MobileFilterSheet } from '../mobile-filter-sheet'

function setMobileViewport(mobile: boolean) {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: mobile && query === '(max-width: 640px)',
  }))
}

function Fixture(props: { activeCount?: number; label?: string }) {
  return (
    <MobileFilterSheet activeCount={props.activeCount} label={props.label}>
      <select aria-label='Team filter'>
        <option>All</option>
      </select>
      <button type='button'>Expiring soon</button>
    </MobileFilterSheet>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MobileFilterSheet', () => {
  it('renders the filters inline on desktop without a trigger', () => {
    setMobileViewport(false)
    render(<Fixture activeCount={2} />)

    expect(screen.getByRole('combobox', { name: 'Team filter' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Expiring soon' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Filter/ })).toBeNull()
  })

  it('collapses the filters behind one trigger on mobile and shows the active count', () => {
    setMobileViewport(true)
    render(<Fixture activeCount={2} />)

    expect(screen.queryByRole('combobox', { name: 'Team filter' })).toBeNull()
    expect(screen.getByRole('button', { name: /Filter/ })).toHaveTextContent(
      '2'
    )
  })

  it('uses the given label on the trigger and hides a zero count', () => {
    setMobileViewport(true)
    render(<Fixture activeCount={0} label='This month' />)

    const trigger = screen.getByRole('button', { name: /This month/ })
    expect(trigger).not.toHaveTextContent('0')
  })

  it('opens a bottom sheet with every filter and closes it with Done', async () => {
    setMobileViewport(true)
    const user = userEvent.setup()
    render(<Fixture />)

    await user.click(screen.getByRole('button', { name: /Filter/ }))

    expect(
      await screen.findByRole('combobox', { name: 'Team filter' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expiring soon' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('combobox', { name: 'Team filter' })).toBeNull()
  })
})
