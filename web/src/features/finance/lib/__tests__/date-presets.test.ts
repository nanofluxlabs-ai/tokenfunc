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

// 时刻都用 UTC 给出，结果只取决于计费时区（UTC+8），与跑测试的机器时区无关
// 2026-01-15 01:00 UTC = 计费时区 2026-01-15 09:00（周四）
const THURSDAY = new Date(Date.UTC(2026, 0, 15, 1, 0))
// 2026-03-31 17:30 UTC = 计费时区 2026-04-01 01:30（周三）：UTC 仍是 3 月，计费时区已进入 4 月
const LATE_UTC = new Date(Date.UTC(2026, 2, 31, 17, 30))

describe('date presets', () => {
  it('month-to-date and today defaults use the billing-zone calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(LATE_UTC)
    expect(monthToDateRange()).toEqual({
      start: '2026-04-01',
      end: '2026-04-01',
    })
    expect(todayRange()).toEqual({ start: '2026-04-01', end: '2026-04-01' })
  })

  it('"this month" ends today, "last month" covers the whole previous month', () => {
    expect(presetRange('today', THURSDAY)).toEqual({
      start: '2026-01-15',
      end: '2026-01-15',
    })
    expect(presetRange('month', THURSDAY)).toEqual({
      start: '2026-01-01',
      end: '2026-01-15',
    })
    expect(presetRange('lastMonth', THURSDAY)).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    })
    expect(presetRange('last30', THURSDAY)).toEqual({
      start: '2025-12-17',
      end: '2026-01-15',
    })
    expect(presetRange('lastMonth', LATE_UTC)).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
    })
  })

  it('"this week" starts on Monday, including when today is Monday or Sunday', () => {
    expect(presetRange('week', THURSDAY)).toEqual({
      start: '2026-01-12',
      end: '2026-01-15',
    })
    // 计费时区 2026-01-12 00:30 是周一
    expect(
      presetRange('week', new Date(Date.UTC(2026, 0, 11, 16, 30)))
    ).toEqual({ start: '2026-01-12', end: '2026-01-12' })
    // 计费时区 2026-01-18 23:30 是周日，本周从 1 月 12 日周一算起
    expect(
      presetRange('week', new Date(Date.UTC(2026, 0, 18, 15, 30)))
    ).toEqual({ start: '2026-01-12', end: '2026-01-18' })
    // 跨月：计费时区 2026-04-01 周三，本周一是 3 月 30 日
    expect(presetRange('week', LATE_UTC)).toEqual({
      start: '2026-03-30',
      end: '2026-04-01',
    })
  })

  it('converts a day range to inclusive second timestamps at billing-zone day boundaries', () => {
    const { ts_start, ts_end } = dayRangeToTimestamps({
      start: '2026-03-10',
      end: '2026-03-11',
    })
    // 计费时区 3 月 10 日 00:00 = UTC 3 月 9 日 16:00
    expect(ts_start).toBe(Date.UTC(2026, 2, 9, 16, 0, 0) / 1000)
    // 计费时区 3 月 11 日 23:59:59 = UTC 3 月 11 日 15:59:59
    expect(ts_end).toBe(Date.UTC(2026, 2, 11, 15, 59, 59) / 1000)
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
