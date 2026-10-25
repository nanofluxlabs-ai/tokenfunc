import { describe, expect, test } from 'vitest'

import {
  formatCreditPeriodRange,
  isCreditAwaitingPayment,
} from '../credit-period'

const format = (timestamp: number) => `t${timestamp}`

describe('formatCreditPeriodRange', () => {
  test('time-bounded period shows start ~ end', () => {
    expect(
      formatCreditPeriodRange({ start_at: 1, end_at: 2, closed_at: 0 }, format)
    ).toBe('t1 ~ t2')
  })

  test('closed quota-based period ends at closed_at', () => {
    expect(
      formatCreditPeriodRange({ start_at: 1, end_at: 0, closed_at: 5 }, format)
    ).toBe('t1 ~ t5')
  })

  test('open quota-based period has no end', () => {
    expect(
      formatCreditPeriodRange({ start_at: 1, end_at: 0, closed_at: 0 }, format)
    ).toBe('t1 ~ —')
  })
})

describe('isCreditAwaitingPayment', () => {
  test('quota based without auto reset and no open period is awaiting payment', () => {
    expect(
      isCreditAwaitingPayment(
        { credit_cycle_type: 'quota_based', credit_auto_reset: false },
        false
      )
    ).toBe(true)
  })

  test('open period, auto reset or time-based cycles are not awaiting payment', () => {
    expect(
      isCreditAwaitingPayment(
        { credit_cycle_type: 'quota_based', credit_auto_reset: false },
        true
      )
    ).toBe(false)
    expect(
      isCreditAwaitingPayment(
        { credit_cycle_type: 'quota_based', credit_auto_reset: true },
        false
      )
    ).toBe(false)
    expect(
      isCreditAwaitingPayment(
        { credit_cycle_type: 'natural_month', credit_auto_reset: false },
        false
      )
    ).toBe(false)
  })
})
