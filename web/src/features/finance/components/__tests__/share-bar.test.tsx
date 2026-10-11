import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ShareBar } from '../share-bar'

describe('ShareBar', () => {
  it('renders the value, a clamped progress bar and a one-decimal percentage', () => {
    render(<ShareBar value='$12.3400' percentage={70.44} />)
    expect(screen.getByText('$12.3400')).toBeInTheDocument()
    expect(screen.getByText('70.4%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '70.44'
    )
  })

  it('shows "<0.1%" for tiny non-zero shares and clamps values above 100', () => {
    const { rerender } = render(<ShareBar value='$0.0001' percentage={0.004} />)
    expect(screen.getByText('<0.1%')).toBeInTheDocument()
    rerender(<ShareBar value='$1' percentage={140} />)
    expect(screen.getByText('100.0%')).toBeInTheDocument()
  })
})
