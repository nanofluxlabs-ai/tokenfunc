import { describe, expect, it } from 'vitest'

import { FEATURED_MODELS } from '../content'
import { formatUsdPerMillion } from '../lib/landing-models'

describe('formatUsdPerMillion', () => {
  it('keeps two to three decimals without trailing zeros', () => {
    expect(formatUsdPerMillion(15)).toBe('$15.00')
    expect(formatUsdPerMillion(0.3)).toBe('$0.30')
    expect(formatUsdPerMillion(0.125)).toBe('$0.125')
    expect(formatUsdPerMillion(0.005)).toBe('$0.005')
  })
})

describe('FEATURED_MODELS static price list', () => {
  it('lists each vendor with three or four models and unique model IDs', () => {
    const ids = FEATURED_MODELS.flatMap((vendor) => {
      expect(vendor.models.length).toBeGreaterThanOrEqual(3)
      expect(vendor.models.length).toBeLessThanOrEqual(4)
      return vendor.models.map((model) => model.id)
    })
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every price positive with cache reads cheaper than input', () => {
    for (const vendor of FEATURED_MODELS) {
      for (const model of vendor.models) {
        expect(model.price.input).toBeGreaterThan(0)
        expect(model.price.output).toBeGreaterThan(0)
        expect(model.price.cacheRead).toBeGreaterThan(0)
        expect(model.price.cacheRead).toBeLessThan(model.price.input)
      }
    }
  })
})
