import { describe, expect, test } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import { computeListPrices } from '../list-prices'

const base: PricingModel = {
  id: 1,
  model_name: 'gpt-4o',
  quota_type: 0,
  model_ratio: 1.25,
  completion_ratio: 4,
  cache_ratio: 0.5,
  enable_groups: ['default'],
}

describe('landing list prices', () => {
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
})
