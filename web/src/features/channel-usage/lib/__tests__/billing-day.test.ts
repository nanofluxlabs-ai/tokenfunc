import { describe, expect, it } from 'vitest'

import {
  billingCalendarDay,
  billingMonthFirstDay,
  billingPresetRange,
  formatBillingDate,
} from '../billing-day'

// 2026-03-10 23:30 UTC = 计费时区（UTC+8）2026-03-11 07:30
const LATE_UTC = Date.UTC(2026, 2, 10, 23, 30)
// 2026-03-10 15:59 UTC = 计费时区 2026-03-10 23:59，距跨日 1 分钟
const BEFORE_MIDNIGHT = Date.UTC(2026, 2, 10, 15, 59)

describe('billing calendar day', () => {
  it('uses the billing time zone instead of the browser zone when UTC and local dates differ', () => {
    expect(billingCalendarDay(0, LATE_UTC)).toBe('2026-03-11')
    expect(billingCalendarDay(0, BEFORE_MIDNIGHT)).toBe('2026-03-10')
  })

  it('offsets by whole days and crosses month boundaries', () => {
    expect(billingCalendarDay(-1, LATE_UTC)).toBe('2026-03-10')
    expect(billingCalendarDay(-11, LATE_UTC)).toBe('2026-02-28')
    expect(billingMonthFirstDay(LATE_UTC)).toBe('2026-03-01')
  })

  it('formats a midnight timestamp back to the same billing day', () => {
    // 计费时区 2026-03-11 00:00 = UTC 2026-03-10 16:00
    expect(formatBillingDate(Date.UTC(2026, 2, 10, 16) / 1000)).toBe(
      '2026-03-11'
    )
  })
})

describe('billing date presets', () => {
  it('builds today, yesterday, rolling windows and month-to-date in the billing zone', () => {
    expect(billingPresetRange('today', LATE_UTC)).toEqual({
      start: '2026-03-11',
      end: '2026-03-11',
    })
    expect(billingPresetRange('yesterday', LATE_UTC)).toEqual({
      start: '2026-03-10',
      end: '2026-03-10',
    })
    expect(billingPresetRange('last7', LATE_UTC)).toEqual({
      start: '2026-03-05',
      end: '2026-03-11',
    })
    expect(billingPresetRange('last30', LATE_UTC)).toEqual({
      start: '2026-02-10',
      end: '2026-03-11',
    })
    expect(billingPresetRange('month', LATE_UTC)).toEqual({
      start: '2026-03-01',
      end: '2026-03-11',
    })
  })
})
