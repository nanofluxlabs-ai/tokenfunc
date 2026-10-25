import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { EnterpriseToken } from '../../types'
import { TokenQuotaCell } from '../token-quota-cell'

function token(partial: Partial<EnterpriseToken>): EnterpriseToken {
  return {
    id: 1,
    name: 'key',
    key: 'abcd**********wxyz',
    status: 1,
    remain_quota: 0,
    unlimited_quota: true,
    used_quota: 0,
    expired_time: -1,
    created_time: 1,
    accessed_time: 1,
    group: '',
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    team_id: 6,
    team_name: 'Research',
    team_status: 'active',
    member_id: 0,
    member_name: '',
    month_quota: 0,
    prev_month_quota: 0,
    reset_period: '',
    period_quota: 0,
    next_reset_at: 0,
    ...partial,
  }
}

describe('TokenQuotaCell', () => {
  test('a key without a policy falls back to the upstream quota cell', () => {
    render(<TokenQuotaCell row={token({})} now={Date.now()} />)
    expect(screen.getByText('Unlimited')).toBeInTheDocument()
    expect(screen.queryByText(/Resets /)).toBeNull()
  })

  test('a periodic key shows remaining over the period amount, the period and the next reset in Shanghai time', () => {
    render(
      <TokenQuotaCell
        row={token({
          unlimited_quota: false,
          remain_quota: 6_200_000,
          reset_period: 'monthly',
          period_quota: 25_000_000,
          // 2026-10-25T16:00Z = 2026-10-26 00:00 上海时间
          next_reset_at: 1_792_944_000,
        })}
        now={Date.now()}
      />
    )
    expect(screen.getByText('$12.4')).toBeInTheDocument()
    expect(screen.getByText(/\/ 50 · Monthly/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '24.8'
    )
    expect(screen.getByText(/^Resets 10\S*26, 00:00$/)).toBeInTheDocument()
  })

  test('an exhausted periodic key renders zero remaining and a muted bar', () => {
    render(
      <TokenQuotaCell
        row={token({
          unlimited_quota: false,
          remain_quota: 0,
          reset_period: 'daily',
          period_quota: 500_000,
          next_reset_at: 1_792_944_000,
        })}
        now={Date.now()}
      />
    )
    expect(screen.getByText('$0')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    )
  })
})
