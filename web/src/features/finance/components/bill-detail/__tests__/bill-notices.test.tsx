import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type BillNotice, BillNotices } from '../bill-notices'

const NOTICES: BillNotice[] = [
  { key: 'open', text: 'Period still open', warning: true },
  { key: 'archive', text: 'Read from archive' },
  { key: 'frozen', text: 'Frozen snapshot' },
]

function setMobileViewport(mobile: boolean) {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: mobile && query === '(max-width: 640px)',
  }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BillNotices', () => {
  it('lists every notice on desktop', () => {
    setMobileViewport(false)
    render(<BillNotices notices={NOTICES} />)

    expect(screen.getByText('Period still open')).toBeInTheDocument()
    expect(screen.getByText('Read from archive')).toBeInTheDocument()
    expect(screen.getByText('Frozen snapshot')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more notes/ })).toBeNull()
  })

  it('shows only the first notice on mobile and folds the rest behind a toggle', async () => {
    setMobileViewport(true)
    const user = userEvent.setup()
    render(<BillNotices notices={NOTICES} />)

    expect(screen.getByText('Period still open')).toBeInTheDocument()
    expect(screen.queryByText('Read from archive')).toBeNull()

    await user.click(screen.getByRole('button', { name: '2 more notes' }))

    expect(screen.getByText('Read from archive')).toBeInTheDocument()
    expect(screen.getByText('Frozen snapshot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide notes' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('renders a single notice on mobile without a toggle and nothing when empty', () => {
    setMobileViewport(true)
    const { rerender, container } = render(
      <BillNotices notices={NOTICES.slice(0, 1)} />
    )

    expect(screen.getByText('Period still open')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()

    rerender(<BillNotices notices={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
