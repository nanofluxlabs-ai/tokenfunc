import { describe, expect, it } from 'vitest'

import {
  formatSignedUsd,
  isTopupSource,
  paymentMethodLabel,
} from '../topup-display'

const identity = (key: string) => key

describe('formatSignedUsd', () => {
  it('prefixes positive amounts with $ and keeps the sign in front of $ for negatives', () => {
    expect(formatSignedUsd('10.000000')).toBe('$10.000000')
    expect(formatSignedUsd('-37645.000000')).toBe('-$37645.000000')
    expect(formatSignedUsd('0.000000')).toBe('$0.000000')
  })
})

describe('paymentMethodLabel', () => {
  it('maps each provider/method segment through the finance payment labels', () => {
    expect(paymentMethodLabel('epay/alipay', identity)).toBe('Epay / Alipay')
    expect(paymentMethodLabel('stripe', identity)).toBe('Stripe')
  })

  it('keeps unknown segments verbatim and shows a dash for empty input', () => {
    expect(paymentMethodLabel('bank_wire', identity)).toBe('bank_wire')
    expect(paymentMethodLabel('', identity)).toBe('-')
  })
})

describe('isTopupSource', () => {
  it('accepts registered sources only', () => {
    expect(isTopupSource('online')).toBe(true)
    expect(isTopupSource('refund')).toBe(true)
    expect(isTopupSource('all')).toBe(false)
    expect(isTopupSource(undefined)).toBe(false)
  })
})
