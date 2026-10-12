import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { FinanceUserConsumption } from '../../types'
import {
  BalanceCell,
  ConsumptionCell,
} from '../user-consumption/user-consumption-cells'

function user(
  overrides: Partial<FinanceUserConsumption>
): FinanceUserConsumption {
  return {
    user_id: 1,
    username: 'alice',
    group: 'default',
    status: 1,
    role: 1,
    remain_quota: 500000,
    used_quota: 250000,
    total_quota: 750000,
    is_paid_user: false,
    has_successful_order: false,
    consume_quota: 250000,
    refund_quota: 50000,
    net_quota: 200000,
    consume_count: 3,
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    last_consume_at: 0,
    text_input_tokens: 80,
    text_output_tokens: 50,
    cache_read_tokens: 20,
    cache_write_tokens: 0,
    audio_input_tokens: 0,
    audio_output_tokens: 0,
    wallet_consume_quota: 150000,
    subscription_consume_quota: 100000,
    current_subscription_id: 0,
    current_subscription_count: 0,
    current_subscription_plan_id: 0,
    current_subscription_plan_title: '',
    current_subscription_amount_used: 0,
    current_subscription_amount_total: 0,
    current_subscription_source: '',
    current_subscription_end_time: 0,
    is_enterprise: false,
    ...overrides,
  }
}

describe('user consumption cells', () => {
  it('shows remaining credit and the used / limit line for credit-billed enterprises', () => {
    render(
      <BalanceCell
        row={user({
          is_enterprise: true,
          billing_mode: 'credit',
          credit_period: {
            period_no: 2,
            limit_quota: 1_000_000,
            used_quota: 250_000,
            start_at: 0,
            end_at: 0,
            status: 'open',
          },
        })}
      />
    )
    expect(screen.getByText('$1.5')).toBeInTheDocument()
    expect(screen.getByText('Used $0.5 / $2 this period')).toBeInTheDocument()
  })

  it('shows the wallet balance and wallet charge for prepaid users', () => {
    render(<BalanceCell row={user({})} />)
    expect(screen.getByText('$1')).toBeInTheDocument()
    expect(screen.getByText(/Wallet charged \$0\.3/)).toBeInTheDocument()
  })

  it('reveals the consumption breakdown on hover', async () => {
    render(<ConsumptionCell row={user({})} locale='en' />)
    expect(screen.getByText('$0.4')).toBeInTheDocument()
    await userEvent.hover(screen.getByText('$0.4'))
    expect(await screen.findByText('From subscription')).toBeInTheDocument()
    expect(screen.getByText('Refunded')).toBeInTheDocument()
    expect(screen.queryByText('Audio input')).not.toBeInTheDocument()
  })
})
