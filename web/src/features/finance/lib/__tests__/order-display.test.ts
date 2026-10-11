import { describe, expect, it } from 'vitest'

import { formatMoney, formatOrderAmount } from '../order-display'

describe('order display', () => {
  it('prefixes known currencies with their symbol and unknown ones with the code', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1234.50')
    expect(formatMoney(73, 'CNY')).toBe('¥73.00')
    expect(formatMoney(1, 'CUSTOM')).toBe('¤1.00')
    expect(formatMoney(2, 'EUR')).toBe('EUR 2.00')
  })

  it('shows the USD amount alone for USD orders and appends the original currency otherwise', () => {
    expect(
      formatOrderAmount({ amount: 200, usd_amount: 200, currency: 'USD' })
    ).toBe('$200.00')
    expect(
      formatOrderAmount({ amount: 1380, usd_amount: 200, currency: 'CNY' })
    ).toBe('$200.00 (¥1380.00)')
  })
})
