import { describe, expect, test } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import {
  applyDiscount,
  computeListPrices,
  isQuotableModel,
} from '../quote-pricing'

const base: PricingModel = {
  id: 1,
  model_name: 'gpt-4o',
  quota_type: 0,
  model_ratio: 1.25,
  completion_ratio: 4,
  cache_ratio: 0.5,
  enable_groups: ['default'],
}

describe('quote pricing', () => {
  test('list prices follow ratio x 2 x group ratio per 1M tokens', () => {
    expect(computeListPrices(base, 1)).toEqual({
      input: 2.5,
      output: 10,
      cache: 1.25,
    })
    expect(computeListPrices(base, 1.2)).toEqual({
      input: 3,
      output: 12,
      cache: 1.5,
    })
  })

  test('cache price is null when the model has no cache ratio', () => {
    expect(
      computeListPrices({ ...base, cache_ratio: null }, 1).cache
    ).toBeNull()
  })

  test('discount rounds to 4 decimals', () => {
    expect(applyDiscount(2.5, 15)).toBe(2.125)
    expect(applyDiscount(10, 0)).toBe(10)
  })

  test('only token-billed non-task models are quotable', () => {
    expect(isQuotableModel(base)).toBe(true)
    expect(isQuotableModel({ ...base, quota_type: 1 })).toBe(false)
    expect(
      isQuotableModel({
        ...base,
        billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
      })
    ).toBe(false)
  })
})
