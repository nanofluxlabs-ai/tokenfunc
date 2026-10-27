import { describe, expect, test } from 'vitest'

import type {
  FlowQuotaDataItem,
  QuotaDataItem,
} from '@/features/dashboard/types'

import {
  buildHourlyHeatmap,
  buildKeyRanking,
  buildPersonalSnapshot,
  buildRangeBreakdown,
  buildTrendRows,
  personalFetchStart,
} from '../personal-overview'

/** 本地时间字符串 → quota_data 行（created_at 为整点秒级时间戳），与运行时区无关 */
function row(
  localTime: string,
  quota: number,
  model = 'gpt-5',
  count = 1,
  tokens = 100
): QuotaDataItem {
  return {
    created_at: new Date(localTime).getTime() / 1000,
    model_name: model,
    quota,
    count,
    token_used: tokens,
  }
}

describe('buildPersonalSnapshot', () => {
  test('compares today with yesterday up to the same hour, not the whole day', () => {
    const now = new Date('2026-10-27T10:20:00')
    const rows = [
      row('2026-10-27T09:00:00', 300),
      row('2026-10-27T10:00:00', 200),
      row('2026-10-26T10:00:00', 100),
      row('2026-10-26T11:00:00', 9_000),
      row('2026-10-26T22:00:00', 9_000),
    ]

    const snapshot = buildPersonalSnapshot(rows, now)

    expect(snapshot.today.quota).toBe(500)
    expect(snapshot.yesterdaySamePeriod.quota).toBe(100)
  })

  test('compares month-to-date with the same days of last month', () => {
    const now = new Date('2026-10-05T12:30:00')
    const rows = [
      row('2026-10-01T08:00:00', 400),
      row('2026-09-03T08:00:00', 150),
      row('2026-09-05T12:00:00', 50),
      row('2026-09-05T13:00:00', 7_000),
      row('2026-09-20T08:00:00', 7_000),
    ]

    const snapshot = buildPersonalSnapshot(rows, now)

    expect(snapshot.monthToDate.quota).toBe(400)
    expect(snapshot.lastMonthSamePeriod.quota).toBe(200)
  })

  test('clamps last month to its end when it is shorter than this month', () => {
    const now = new Date('2026-03-31T23:10:00')
    const rows = [
      row('2026-02-28T23:00:00', 80),
      row('2026-03-01T00:00:00', 500),
    ]

    const snapshot = buildPersonalSnapshot(rows, now)

    expect(snapshot.lastMonthSamePeriod.quota).toBe(80)
    expect(snapshot.monthToDate.quota).toBe(500)
  })

  test('averages the 7 complete days before today for the runway estimate', () => {
    const now = new Date('2026-10-27T09:00:00')
    const rows = [
      row('2026-10-20T12:00:00', 700),
      row('2026-10-26T12:00:00', 700),
      row('2026-10-27T08:00:00', 99_999),
    ]

    expect(buildPersonalSnapshot(rows, now).dailyAverageQuota).toBe(200)
  })

  test('falls back to today when there is no usage in the previous 7 days', () => {
    const now = new Date('2026-10-27T09:00:00')

    const snapshot = buildPersonalSnapshot(
      [row('2026-10-27T08:00:00', 350)],
      now
    )

    expect(snapshot.dailyAverageQuota).toBe(350)
  })

  test('returns zero totals and 7 blank sparkline days for empty data', () => {
    const snapshot = buildPersonalSnapshot([], new Date('2026-10-27T09:00:00'))

    expect(snapshot.today).toEqual({ quota: 0, count: 0, tokens: 0 })
    expect(snapshot.last7Days.map((day) => day.day)).toEqual([
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ])
    expect(snapshot.dailyAverageQuota).toBe(0)
  })
})

describe('personalFetchStart', () => {
  test('starts at the 1st of last month when that is earlier than 30 days ago', () => {
    expect(personalFetchStart(new Date('2026-10-27T09:00:00'))).toEqual(
      new Date('2026-09-01T00:00:00')
    )
  })

  test('starts 29 days back when last month is too short to cover 30 days', () => {
    expect(personalFetchStart(new Date('2026-03-01T09:00:00'))).toEqual(
      new Date('2026-01-31T00:00:00')
    )
  })
})

describe('buildRangeBreakdown', () => {
  test('keeps the top models by spend and folds the rest into others', () => {
    const now = new Date('2026-10-27T09:00:00')
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((model, index) =>
      row('2026-10-27T08:00:00', 700 - index * 100, model)
    )

    const breakdown = buildRangeBreakdown(rows, now, 7)

    expect(breakdown.models.map((model) => [model.field, model.name])).toEqual(
      [
        ['m0', 'a'],
        ['m1', 'b'],
        ['m2', 'c'],
        ['m3', 'd'],
        ['m4', 'e'],
        ['other', null],
      ]
    )
    expect(breakdown.models.at(-1)?.quota).toBe(200 + 100)
    expect(breakdown.totals.quota).toBe(2_800)
  })

  test('keeps the 30-day model order in the 7-day range so colors stay put', () => {
    const now = new Date('2026-10-27T09:00:00')
    const rows = [
      // 近 30 天 old 消耗最多，但近 7 天没有用量；近 7 天 b 比 a 多
      row('2026-10-05T08:00:00', 5_000, 'old'),
      row('2026-10-26T08:00:00', 100, 'a'),
      row('2026-10-26T08:00:00', 300, 'b'),
      row('2026-10-10T08:00:00', 1_000, 'a'),
    ]

    const week = buildRangeBreakdown(rows, now, 7)
    const month = buildRangeBreakdown(rows, now, 30)

    expect(week.models.map((model) => model.name)).toEqual(['old', 'a', 'b'])
    expect(month.models.map((model) => model.name)).toEqual(['old', 'a', 'b'])
    expect(week.models.map((model) => model.quota)).toEqual([0, 100, 300])
  })

  test('only counts days inside the selected range', () => {
    const now = new Date('2026-10-27T09:00:00')
    const rows = [
      row('2026-10-21T08:00:00', 10),
      row('2026-10-20T08:00:00', 1_000),
    ]

    expect(buildRangeBreakdown(rows, now, 7).totals.quota).toBe(10)
    expect(buildRangeBreakdown(rows, now, 30).totals.quota).toBe(1_010)
    expect(buildRangeBreakdown(rows, now, 30).days).toHaveLength(30)
  })

  test('builds one trend row per day with a field per model and others', () => {
    const now = new Date('2026-10-27T09:00:00')
    const rows = [
      row('2026-10-27T08:00:00', 300, 'a', 3),
      row('2026-10-27T08:00:00', 5, 'b', 7),
    ]

    const trend = buildTrendRows(buildRangeBreakdown(rows, now, 7, 1), 'count')

    expect(trend.at(-1)).toEqual({ day: '2026-10-27', m0: 3, other: 7 })
    expect(trend.at(0)).toEqual({ day: '2026-10-21', m0: 0, other: 0 })
  })
})

describe('buildHourlyHeatmap', () => {
  test('places requests into local day and hour cells for the last 7 days', () => {
    const now = new Date('2026-10-27T09:00:00')
    const rows = [
      row('2026-10-27T03:00:00', 1, 'a', 4),
      row('2026-10-27T03:00:00', 1, 'b', 2),
      row('2026-10-19T03:00:00', 1, 'a', 50),
    ]

    const cells = buildHourlyHeatmap(rows, now)

    expect(cells).toHaveLength(7 * 24)
    expect(cells.find((cell) => cell.day === '2026-10-27' && cell.hour === 3))
      .toEqual({ day: '2026-10-27', hour: 3, count: 6 })
    expect(cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(6)
  })
})

describe('buildKeyRanking', () => {
  test('sums each key across models and sorts by spend', () => {
    const rows: FlowQuotaDataItem[] = [
      { token_id: 1, token_name: 'prod', model_name: 'a', quota: 100, count: 1 },
      { token_id: 2, token_name: 'dev', model_name: 'a', quota: 300, count: 1 },
      { token_id: 1, token_name: 'prod', model_name: 'b', quota: 250, count: 2 },
      { token_id: 3, token_name: '', model_name: 'a', quota: 0, count: 0 },
    ]

    expect(
      buildKeyRanking(rows, 8).map((key) => [key.name, key.quota, key.count])
    ).toEqual([
      ['prod', 350, 3],
      ['dev', 300, 1],
    ])
  })
})
