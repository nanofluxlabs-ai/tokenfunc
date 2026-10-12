import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { TopupSourceRow } from '../../types'
import { TopupSourceTable } from '../topup-source-table'

const online: TopupSourceRow = {
  type: 'topup',
  source: 'online',
  payment_method: 'epay/alipay',
  count: 3,
  quota: 15_000_000,
  amount_usd: '30.000000',
  percentage: 75.5,
}

const adjust: TopupSourceRow = {
  type: 'adjust',
  source: 'admin_adjust',
  payment_method: '',
  count: 1,
  quota: -9_800_000,
  amount_usd: '-19.600000',
  percentage: -49.3,
}

describe('TopupSourceTable', () => {
  it('renders a share bar for positive rows and a plain negative percentage for deductions', () => {
    render(<TopupSourceTable rows={[online, adjust]} />)
    expect(screen.getByText('Epay / Alipay')).toBeInTheDocument()
    expect(screen.getByText('$30.000000')).toBeInTheDocument()
    expect(screen.getByText('-$19.600000')).toBeInTheDocument()
    expect(screen.getByText('-49.30%')).toBeInTheDocument()
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(1)
    expect(bars[0]).toHaveAttribute('aria-valuenow', '75.5')
  })

  it('shows the empty message when there are no rows and loading has finished', () => {
    render(<TopupSourceTable rows={[]} isLoading={false} />)
    expect(
      screen.getByText('No wallet entries in this period')
    ).toBeInTheDocument()
  })
})
