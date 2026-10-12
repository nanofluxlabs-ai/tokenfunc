import { describe, expect, it } from 'vitest'

import {
  creditUsagePercent,
  formatBillRef,
  parseBillRef,
  periodDays,
} from '../bill-ref'

describe('bill ref helpers', () => {
  it('round-trips bill and period refs and rejects anything else', () => {
    expect(formatBillRef({ kind: 'bill', id: 12 })).toBe('bill-12')
    expect(parseBillRef('period-5')).toEqual({ kind: 'period', id: 5 })
    expect(parseBillRef('bill-0')).toBeNull()
    expect(parseBillRef('invoice-1')).toBeNull()
    expect(parseBillRef('12')).toBeNull()
  })

  it('counts whole days of a half-open period and guards empty periods', () => {
    expect(periodDays(0, 31 * 86400)).toBe(31)
    expect(periodDays(100, 100)).toBe(0)
  })

  it('returns null usage when there is no credit limit', () => {
    expect(creditUsagePercent(250, 1000)).toBe(25)
    expect(creditUsagePercent(10, 0)).toBeNull()
  })
})
