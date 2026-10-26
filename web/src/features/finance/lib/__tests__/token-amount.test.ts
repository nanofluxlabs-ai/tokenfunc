import { describe, expect, it } from 'vitest'

import { formatTokenAmount } from '../token-amount'

describe('formatTokenAmount', () => {
  it('keeps counts under one thousand as whole numbers', () => {
    expect(formatTokenAmount(0)).toBe('0')
    expect(formatTokenAmount(512)).toBe('512')
    expect(formatTokenAmount(999)).toBe('999')
  })

  it('converts to K / M / B / T with two decimals', () => {
    expect(formatTokenAmount(1_000)).toBe('1.00K')
    expect(formatTokenAmount(6_000)).toBe('6.00K')
    expect(formatTokenAmount(1_234_567)).toBe('1.23M')
    expect(formatTokenAmount(7_890_000_000)).toBe('7.89B')
    expect(formatTokenAmount(2_500_000_000_000)).toBe('2.50T')
  })

  it('moves to the next unit when rounding reaches one thousand', () => {
    expect(formatTokenAmount(999_999)).toBe('1.00M')
    expect(formatTokenAmount(999_995_000)).toBe('1.00B')
  })

  it('stays in T for very large values and treats invalid input as zero', () => {
    expect(formatTokenAmount(1_234_000_000_000_000)).toBe('1234.00T')
    expect(formatTokenAmount(Number.NaN)).toBe('0')
    expect(formatTokenAmount(-5)).toBe('0')
  })
})
