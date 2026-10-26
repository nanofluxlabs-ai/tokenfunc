import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { Team } from '../../types'
import { TeamBudgetMeter } from '../team-budget-meter'

function team(partial: Partial<Team>): Team {
  return {
    id: 1,
    name: 'Research',
    sort: 0,
    is_default: false,
    status: 'active',
    monthly_budget_quota: 0,
    budget_alert_percent: 80,
    budget_enforce: false,
    created_at: 0,
    member_count: 0,
    token_count: 0,
    month_quota: 0,
    budget_percent: 0,
    budget_state: 'none',
    ...partial,
  }
}

describe('TeamBudgetMeter', () => {
  test('renders nothing when the team has no monthly budget', () => {
    const { container } = render(<TeamBudgetMeter team={team({})} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the usage ratio and a warning badge at the alert threshold', () => {
    render(
      <TeamBudgetMeter
        team={team({
          monthly_budget_quota: 500000,
          month_quota: 425000,
          budget_percent: 85,
          budget_state: 'warn',
        })}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '85'
    )
    expect(screen.getByText('Budget warning')).toBeInTheDocument()
    expect(screen.queryByText('Over budget')).not.toBeInTheDocument()
    expect(screen.queryByText('Blocked by budget')).not.toBeInTheDocument()
  })

  test('caps the bar at 100% and marks an enforced team as blocked when over budget', () => {
    render(
      <TeamBudgetMeter
        team={team({
          monthly_budget_quota: 500000,
          month_quota: 650000,
          budget_percent: 130,
          budget_state: 'exceeded',
          budget_enforce: true,
        })}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100'
    )
    expect(screen.getByText('Over budget')).toBeInTheDocument()
    expect(screen.getByText('Blocked by budget')).toBeInTheDocument()
  })

  test('does not show the blocked badge when enforcement is off', () => {
    render(
      <TeamBudgetMeter
        team={team({
          monthly_budget_quota: 500000,
          month_quota: 500000,
          budget_percent: 100,
          budget_state: 'exceeded',
          budget_enforce: false,
        })}
      />
    )
    expect(screen.getByText('Over budget')).toBeInTheDocument()
    expect(screen.queryByText('Blocked by budget')).not.toBeInTheDocument()
  })

  test('hides the amount when the caller already shows it but keeps percent and badges', () => {
    render(
      <TeamBudgetMeter
        size='md'
        showAmount={false}
        team={team({
          monthly_budget_quota: 500000,
          month_quota: 425000,
          budget_percent: 85,
          budget_state: 'warn',
        })}
      />
    )
    expect(screen.queryByText(/\$0\.85 \//)).not.toBeInTheDocument()
    expect(screen.getByText(/^85% · Remaining/)).toBeInTheDocument()
    expect(screen.getByText('Budget warning')).toBeInTheDocument()
  })
})
