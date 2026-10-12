import { describe, expect, it } from 'vitest'

import type { UsageGroupModelRow } from '../../types'
import {
  buildUsageGroups,
  countDistinctModels,
  describeRatio,
  formatUnitPrice,
  hasCacheWrite1h,
} from '../usage-breakdown'

function row(overrides: Partial<UsageGroupModelRow>): UsageGroupModelRow {
  return {
    group: 'default',
    group_label: '默认',
    model_name: 'gpt-4o',
    count: 1,
    prompt_tokens: 0,
    completion_tokens: 0,
    input_tokens: 0,
    cached_tokens: 0,
    cache_creation_tokens: 0,
    cache_creation_1h_tokens: 0,
    quota: 1000,
    amount_usd: '0.002000',
    percentage: 0,
    ratios: {
      model_ratio: null,
      group_ratio: null,
      group_ratio_exclusive: false,
      completion_ratio: null,
      cache_ratio: null,
      cache_creation_ratio: null,
      cache_creation_ratio_1h: null,
      model_price: null,
    },
    unit_prices: {
      input: null,
      cache_read: null,
      cache_write_5m: null,
      cache_write_1h: null,
      output: null,
    },
    ...overrides,
  }
}

describe('usage breakdown helpers', () => {
  it('groups rows by token group, sums totals and sorts groups and models by quota', () => {
    const groups = buildUsageGroups(
      [
        row({
          group: 'a',
          group_label: 'A',
          model_name: 'm1',
          quota: 100,
          amount_usd: '0.0002',
          count: 1,
        }),
        row({
          group: 'b',
          group_label: 'B',
          model_name: 'm2',
          quota: 900,
          amount_usd: '0.0018',
          count: 9,
        }),
        row({
          group: 'a',
          group_label: 'A',
          model_name: 'm3',
          quota: 300,
          amount_usd: '0.0006',
          count: 3,
          ratios: {
            ...row({}).ratios,
            group_ratio: { value: 0.8 },
            group_ratio_exclusive: true,
          },
        }),
        row({
          group: '',
          group_label: '',
          model_name: 'm4',
          quota: 1,
          amount_usd: '0',
          count: 1,
        }),
      ],
      1301,
      'Ungrouped'
    )
    expect(groups.map((group) => group.label)).toEqual(['B', 'A', 'Ungrouped'])
    const a = groups[1]
    expect(a.count).toBe(4)
    expect(a.quota).toBe(400)
    expect(a.amountUsd).toBeCloseTo(0.0008, 6)
    expect(a.modelCount).toBe(2)
    expect(a.models.map((model) => model.model_name)).toEqual(['m3', 'm1'])
    expect(a.groupRatio).toEqual({ value: 0.8 })
    expect(a.groupRatioExclusive).toBe(true)
    expect(groups[0].percentage).toBeCloseTo((900 / 1301) * 100, 6)
  })

  it('only splits the 1h cache write column when some row has 1h writes', () => {
    expect(hasCacheWrite1h([row({ cache_creation_1h_tokens: 0 })])).toBe(false)
    expect(
      hasCacheWrite1h([row({}), row({ cache_creation_1h_tokens: 5 })])
    ).toBe(true)
  })

  it('counts distinct models across groups', () => {
    expect(
      countDistinctModels([
        row({ group: 'a', model_name: 'x' }),
        row({ group: 'b', model_name: 'x' }),
        row({ group: 'b', model_name: 'y' }),
      ])
    ).toBe(2)
  })

  it('formats unit prices with 6 decimals below 0.01 and 4 otherwise, "-" when missing', () => {
    expect(formatUnitPrice(null)).toBe('-')
    expect(formatUnitPrice(0.0012346)).toBe('0.001235')
    expect(formatUnitPrice(3.2)).toBe('3.2000')
  })

  it('describes a ratio with its share percentages', () => {
    expect(describeRatio(null, 100)).toBeNull()
    expect(describeRatio({ value: 2.5 }, 100)).toEqual({
      text: '2.5',
      shares: [],
    })
    expect(
      describeRatio(
        {
          value: 2.5,
          shares: [
            { value: 2.5, quota: 75 },
            { value: 3, quota: 25 },
          ],
        },
        100
      )
    ).toEqual({
      text: '2.5',
      shares: [
        { value: 2.5, percent: 75 },
        { value: 3, percent: 25 },
      ],
    })
  })
})
