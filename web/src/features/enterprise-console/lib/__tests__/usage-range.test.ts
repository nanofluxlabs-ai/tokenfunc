import { describe, expect, test } from 'vitest'

import type { UsageSummaryItem } from '../../types'
import {
  fillUsageDays,
  matchUsagePreset,
  sharePercent,
  usageRangeFromPreset,
} from '../usage-range'

function item(day: string, quota: number): UsageSummaryItem {
  return {
    key_id: 0,
    key_name: day,
    request_count: 2,
    prompt_tokens: 100,
    completion_tokens: 50,
    cache_tokens: 10,
    cache_creation_tokens: 0,
    quota,
  }
}

describe('usageRangeFromPreset', () => {
  test('maps each preset to an inclusive day range ending today', () => {
    const today = '2026-10-26'
    expect(usageRangeFromPreset('today', today)).toEqual({
      from: today,
      to: today,
    })
    expect(usageRangeFromPreset('7d', today)).toEqual({
      from: '2026-10-20',
      to: today,
    })
    expect(usageRangeFromPreset('month', today)).toEqual({
      from: '2026-10-01',
      to: today,
    })
    expect(usageRangeFromPreset('30d', today)).toEqual({
      from: '2026-09-27',
      to: today,
    })
  })
})

describe('matchUsagePreset', () => {
  test('returns the preset whose range matches, or null for a custom range', () => {
    const today = '2026-10-26'
    expect(matchUsagePreset({ from: '2026-10-20', to: today }, today)).toBe(
      '7d'
    )
    expect(
      matchUsagePreset({ from: '2026-10-02', to: today }, today)
    ).toBeNull()
  })
})

describe('fillUsageDays', () => {
  test('fills missing days with zeros in ascending order', () => {
    const days = fillUsageDays(
      [item('2026-10-03', 30), item('2026-10-01', 10)],
      {
        from: '2026-10-01',
        to: '2026-10-04',
      }
    )
    expect(days.map((day) => [day.day, day.quota])).toEqual([
      ['2026-10-01', 10],
      ['2026-10-02', 0],
      ['2026-10-03', 30],
      ['2026-10-04', 0],
    ])
    expect(days[0]).toMatchObject({
      request_count: 2,
      prompt_tokens: 100,
      completion_tokens: 50,
      cache_tokens: 10,
    })
  })
})

describe('sharePercent', () => {
  test('rounds to one decimal and returns 0 for an empty total', () => {
    expect(sharePercent(1, 3)).toBe(33.3)
    expect(sharePercent(5, 0)).toBe(0)
  })
})
