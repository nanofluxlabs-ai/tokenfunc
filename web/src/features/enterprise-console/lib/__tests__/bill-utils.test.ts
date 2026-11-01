import { describe, expect, test } from 'vitest'

import { formatBillUsd } from '../bill-utils'

describe('formatBillUsd', () => {
  test('keeps three-decimal quota-derived amounts exact instead of rounding up', () => {
    // 24,000 quota = $0.048，四舍五入成 0.05 会大于真实未付金额
    expect(formatBillUsd(0.048)).toBe('0.048')
  })

  test('pads round amounts to two decimals', () => {
    expect(formatBillUsd(6)).toBe('6.00')
    expect(formatBillUsd(0)).toBe('0.00')
  })

  test('keeps up to six decimals from the backend decimal amount', () => {
    expect(formatBillUsd(3.456789)).toBe('3.456789')
  })

  test('absorbs floating-point subtraction noise from partial payments', () => {
    expect(formatBillUsd(0.048 - 0.02)).toBe('0.028')
    expect(formatBillUsd(10 - 4)).toBe('6.00')
  })

  test('formats negative adjustment previews with two decimals', () => {
    expect(formatBillUsd(-2.5)).toBe('-2.50')
  })
})
