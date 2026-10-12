import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ChannelBreakdownPayer } from '../../types'
import { AmountCell, OthersFooter, PayerBalanceCell } from '../breakdown-cells'

function payer(
  overrides: Partial<ChannelBreakdownPayer>
): ChannelBreakdownPayer {
  return {
    payer_id: 7,
    username: 'alice',
    group: 'default',
    status: 1,
    is_enterprise: false,
    remain_quota: 5_000_000,
    has_subscription: false,
    avg_daily_consume: 0,
    official_quota: 1_000_000,
    quota: 800_000,
    call_count: 3,
    prompt_tokens: 10,
    completion_tokens: 5,
    ...overrides,
  }
}

describe('payer balance cell', () => {
  it('shows a dash for system requests without a payer', () => {
    render(<PayerBalanceCell payer={payer({ payer_id: 0 })} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('shows the wallet balance without a runway hint when the balance lasts a week or more', () => {
    render(
      <PayerBalanceCell
        payer={payer({ remain_quota: 7_000_000, avg_daily_consume: 1_000_000 })}
      />
    )
    expect(screen.getByText('Balance $14')).toBeInTheDocument()
    expect(screen.queryByText(/days left/)).toBeNull()
  })

  it('warns with the remaining days when the balance lasts less than a week', () => {
    render(
      <PayerBalanceCell
        payer={payer({ remain_quota: 1_500_000, avg_daily_consume: 1_000_000 })}
      />
    )
    expect(screen.getByText('About 1 days left')).toHaveClass(
      'text-destructive'
    )
  })

  it('marks an exhausted balance and prefers the subscription hint over runway', () => {
    const { rerender } = render(
      <PayerBalanceCell
        payer={payer({ remain_quota: 0, avg_daily_consume: 1_000_000 })}
      />
    )
    expect(screen.getByText('Balance exhausted')).toBeInTheDocument()
    rerender(
      <PayerBalanceCell
        payer={payer({
          remain_quota: 0,
          avg_daily_consume: 1_000_000,
          has_subscription: true,
        })}
      />
    )
    expect(screen.getByText('Active subscription')).toBeInTheDocument()
    expect(screen.queryByText('Balance exhausted')).toBeNull()
  })

  it('shows credit remaining and the used / limit line for credit-billed enterprises', () => {
    render(
      <PayerBalanceCell
        payer={payer({
          is_enterprise: true,
          enterprise_name: 'Acme',
          billing_mode: 'credit',
          credit_period: {
            period_no: 2,
            limit_quota: 1_000_000,
            used_quota: 950_000,
            start_at: 0,
            end_at: 0,
            status: 'open',
          },
        })}
      />
    )
    expect(screen.getByText('Credit period')).toBeInTheDocument()
    expect(screen.getByText('Remaining $0.1')).toBeInTheDocument()
    expect(screen.getByText('Used $1.9 / $2 this period (95%)')).toHaveClass(
      'text-destructive'
    )
  })

  it('tells when a credit enterprise has no open period', () => {
    render(
      <PayerBalanceCell
        payer={payer({ is_enterprise: true, billing_mode: 'credit' })}
      />
    )
    expect(screen.getByText('No open credit period')).toBeInTheDocument()
  })
})

describe('amount cell and others footer', () => {
  it('renders the selected metric as the primary number and the other metric with its share', () => {
    const amount = payer({})
    const { rerender } = render(
      <AmountCell amount={amount} metric='official' total={4_000_000} />
    )
    expect(screen.getByText('$2')).toBeInTheDocument()
    expect(screen.getByText('Actual charge $1.6 · 25%')).toBeInTheDocument()
    rerender(<AmountCell amount={amount} metric='actual' total={4_000_000} />)
    expect(screen.getByText('$1.6')).toBeInTheDocument()
    expect(screen.getByText('Official price $2 · 20%')).toBeInTheDocument()
  })

  it('renders nothing when there are no other rows and the summary line otherwise', () => {
    const amount = payer({})
    const { container, rerender } = render(
      <OthersFooter
        count={0}
        amount={amount}
        total={amount}
        metric='official'
        text={(count, value, share) => `${count} · ${value} · ${share}`}
      />
    )
    expect(container).toBeEmptyDOMElement()
    rerender(
      <OthersFooter
        count={3}
        amount={payer({ official_quota: 500_000 })}
        total={payer({ official_quota: 5_000_000 })}
        metric='official'
        text={(count, value, share) => `${count} · ${value} · ${share}`}
      />
    )
    expect(screen.getByText('3 · $1 · 10%')).toBeInTheDocument()
  })
})
