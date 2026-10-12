import { describe, expect, it } from 'vitest'

import type { ChannelUsageItem } from '../../types'
import {
  estimateRunwayDays,
  formatShare,
  isChannelExpandable,
  metricValue,
  parseExpandIds,
  sharePercent,
} from '../usage-metrics'

const amount = {
  official_quota: 1000,
  quota: 800,
  call_count: 3,
  prompt_tokens: 10,
  completion_tokens: 5,
}

describe('metric value and share', () => {
  it('picks the official value by default and the actual charge for the actual metric', () => {
    expect(metricValue(amount, 'official')).toBe(1000)
    expect(metricValue(amount, 'actual')).toBe(800)
    expect(metricValue(null, 'official')).toBe(0)
  })

  it('formats shares with <1%, one decimal below 10% and integers above', () => {
    expect(formatShare(0, 1000)).toBe('0%')
    expect(formatShare(5, 1000)).toBe('<1%')
    expect(formatShare(55, 1000)).toBe('5.5%')
    expect(formatShare(550, 1000)).toBe('55%')
    expect(formatShare(10, 0)).toBe('0%')
    expect(sharePercent(2000, 1000)).toBe(100)
  })
})

describe('expand ids and expandability', () => {
  it('parses comma separated positive ids and drops junk', () => {
    expect(parseExpandIds('7, 8,abc,0,-1,20493')).toEqual([7, 8, 20493])
    expect(parseExpandIds(undefined)).toEqual([])
  })

  it('only channels with calls in range are expandable', () => {
    const channel = { range_call_count: 0 } as ChannelUsageItem
    expect(isChannelExpandable(channel)).toBe(false)
    expect(isChannelExpandable({ ...channel, range_call_count: 1 })).toBe(true)
  })
})

describe('runway estimate', () => {
  it('returns remaining balance divided by average daily spend, or null when unknown', () => {
    expect(estimateRunwayDays(7000, 1000)).toBe(7)
    expect(estimateRunwayDays(500, 1000)).toBe(0.5)
    expect(estimateRunwayDays(7000, 0)).toBeNull()
    expect(estimateRunwayDays(0, 1000)).toBeNull()
  })
})
