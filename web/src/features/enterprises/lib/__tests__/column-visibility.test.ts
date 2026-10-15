import { expect, test } from 'vitest'

import { resolveBillingColumnVisibility } from '../column-visibility'

test('a page with only credit enterprises hides the wallet columns and keeps credit columns', () => {
  expect(
    resolveBillingColumnVisibility([
      { billing_mode: 'credit' },
      { billing_mode: 'credit' },
    ])
  ).toEqual({
    quota: false,
    used_quota: false,
    credit_limit: true,
    billing_cycle: true,
    cycle_days: true,
  })
})

test('a page with only prepaid enterprises hides the credit columns and keeps wallet columns', () => {
  expect(resolveBillingColumnVisibility([{ billing_mode: 'prepaid' }])).toEqual(
    {
      quota: true,
      used_quota: true,
      credit_limit: false,
      billing_cycle: false,
      cycle_days: false,
    }
  )
})

test('a mixed page keeps both column groups visible', () => {
  expect(
    resolveBillingColumnVisibility([
      { billing_mode: 'prepaid' },
      { billing_mode: 'credit' },
    ])
  ).toEqual({
    quota: true,
    used_quota: true,
    credit_limit: true,
    billing_cycle: true,
    cycle_days: true,
  })
})

test('an empty page leaves column visibility untouched', () => {
  expect(resolveBillingColumnVisibility([])).toEqual({})
})
