import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MetricTooltip } from '../metric-tooltip'

function setTouchDevice(touch: boolean) {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: touch && query === '(hover: none)',
  }))
}

function Fixture() {
  return (
    <MetricTooltip
      note='Breakdown'
      items={[
        { label: 'Wallet', value: '$1.00' },
        { label: 'Refund', value: '$0.20' },
      ]}
    >
      $0.80
    </MetricTooltip>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MetricTooltip', () => {
  it('opens the breakdown on tap on touch devices', async () => {
    setTouchDevice(true)
    const user = userEvent.setup()
    render(<Fixture />)

    const trigger = screen.getByRole('button', { name: '$0.80' })
    expect(screen.queryByText('Wallet')).toBeNull()

    await user.click(trigger)

    expect(await screen.findByText('Wallet')).toBeInTheDocument()
    expect(screen.getByText('$0.20')).toBeInTheDocument()
    expect(screen.getByText('Breakdown')).toBeInTheDocument()
  })

  it('keeps a hover tooltip trigger, not a button, on devices with a pointer', () => {
    setTouchDevice(false)
    render(<Fixture />)

    expect(screen.getByText('$0.80')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '$0.80' })).toBeNull()
  })
})
