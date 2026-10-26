import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { Enterprise } from '../../types'
import { CreditConfigForm } from '../credit-config-form'

vi.mock('../../api', () => ({ configureEnterpriseCredit: vi.fn() }))

const creditEnterprise = {
  id: 3,
  billing_mode: 'credit',
  credit_cycle_type: 'natural_month',
  credit_cycle_days: 0,
  credit_limit_quota: 50_000_000,
  credit_alert_percent: 80,
  credit_auto_reset: false,
} as Enterprise

afterEach(cleanup)

test('a secondary action renders in the same button row as the submit button, before it', () => {
  render(
    <CreditConfigForm
      enterprise={creditEnterprise}
      onSaved={() => undefined}
      secondaryAction={<button type='button'>Switch to prepaid</button>}
    />
  )

  const submit = screen.getByRole('button', { name: 'Update credit' })
  const secondary = screen.getByRole('button', { name: 'Switch to prepaid' })
  expect(secondary.parentElement).toBe(submit.parentElement)
  expect(
    secondary.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
})

test('without a secondary action only the submit button is in the row', () => {
  render(
    <CreditConfigForm enterprise={creditEnterprise} onSaved={() => undefined} />
  )

  const submit = screen.getByRole('button', { name: 'Update credit' })
  expect(submit.parentElement?.querySelectorAll('button')).toHaveLength(1)
})
