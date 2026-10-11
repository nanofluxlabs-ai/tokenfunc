import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  dayRangeToTimestamps,
  monthToDateRange,
  normalizeDayRange,
  parseDay,
  presetRange,
  todayRange,
} from '../date-presets'

afterEach(() => {
  vi.useRealTimers()
})

describe('date presets', () => {
  it('month-to-date range starts on the first day of the current month and ends today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 12, 15, 0, 0))
    expect(monthToDateRange()).toEqual({
      start: '2026-10-01',
      end: '2026-10-12',
    })
    expect(todayRange()).toEqual({ start: '2026-10-12', end: '2026-10-12' })
  })

  it('"this month" and "last month" presets cover the whole calendar month, "last 30 days" ends today', () => {
    const now = new Date(2026, 0, 15, 9, 0, 0)
    expect(presetRange('today', now)).toEqual({
      start: '2026-01-15',
      end: '2026-01-15',
    })
    expect(presetRange('month', now)).toEqual({
      start: '2026-01-01',
      end: '2026-01-31',
    })
    expect(presetRange('lastMonth', now)).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    })
    expect(presetRange('last30', now)).toEqual({
      start: '2025-12-17',
      end: '2026-01-15',
    })
  })

  it('converts a day range to inclusive second timestamps at local day boundaries', () => {
    const { ts_start, ts_end } = dayRangeToTimestamps({
      start: '2026-03-10',
      end: '2026-03-11',
    })
    expect(new Date(ts_start * 1000)).toEqual(new Date(2026, 2, 10, 0, 0, 0))
    expect(new Date(ts_end * 1000)).toEqual(new Date(2026, 2, 11, 23, 59, 59))
  })

  it('parses only valid YYYY-MM-DD values', () => {
    expect(parseDay('2026-03-10')).toEqual(new Date(2026, 2, 10))
    expect(parseDay('2026-13-40')).toBeUndefined()
    expect(parseDay('10/03/2026')).toBeUndefined()
    expect(parseDay('')).toBeUndefined()
  })

  it('falls back when the range is missing or reversed', () => {
    const fallback = { start: '2026-01-01', end: '2026-01-02' }
    expect(normalizeDayRange('2026-02-01', '2026-02-03', fallback)).toEqual({
      start: '2026-02-01',
      end: '2026-02-03',
    })
    expect(normalizeDayRange('2026-02-03', '2026-02-01', fallback)).toBe(
      fallback
    )
    expect(normalizeDayRange(undefined, '2026-02-01', fallback)).toBe(fallback)
  })
})
