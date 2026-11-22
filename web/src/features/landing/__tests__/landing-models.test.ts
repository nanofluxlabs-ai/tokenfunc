import { describe, expect, it } from 'vitest'

import type { PricingData, PricingModel } from '@/features/pricing/types'

import type { FeaturedVendor } from '../content'
import {
  buildFeaturedRows,
  formatUsdPerMillion,
  resolveDefaultGroupRatio,
} from '../lib/landing-models'

function model(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  } as PricingModel
}

function pricing(
  models: PricingModel[],
  extra: Partial<PricingData> = {}
): PricingData {
  return {
    success: true,
    data: models,
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
    ...extra,
  }
}

const claude: FeaturedVendor = {
  key: 'claude',
  label: 'Claude',
  vendor: 'Anthropic',
  note: 'note',
  models: [
    { id: 'claude-opus-5-5', tag: 'Flagship' },
    { id: 'claude-sonnet-5-5', tag: 'Balanced' },
    { id: 'claude-haiku-5-5', tag: 'Lite' },
  ],
}

describe('buildFeaturedRows', () => {
  it('returns featured models in config order with prices from the pricing data', () => {
    const rows = buildFeaturedRows(
      pricing([
        model({
          model_name: 'claude-sonnet-5-5',
          model_ratio: 1,
          completion_ratio: 5,
          cache_ratio: 0.05,
        }),
        model({
          model_name: 'claude-opus-5-5',
          model_ratio: 2,
          completion_ratio: 5,
        }),
      ]),
      claude
    )

    expect(rows.map((row) => row.id)).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
    ])
    expect(rows[1]).toEqual({
      id: 'claude-sonnet-5-5',
      tag: 'Balanced',
      inputUSD: 2,
      cacheUSD: 0.1,
      outputUSD: 10,
    })
    expect(rows[0].cacheUSD).toBeNull()
  })

  it('skips featured models that are missing from the pricing data instead of inventing a price', () => {
    const rows = buildFeaturedRows(
      pricing([model({ model_name: 'claude-sonnet-5-5' })]),
      claude
    )
    expect(rows.map((row) => row.id)).toEqual(['claude-sonnet-5-5'])
  })

  it('skips featured models that are not billed per token', () => {
    const rows = buildFeaturedRows(
      pricing([model({ model_name: 'claude-sonnet-5-5', quota_type: 1 })]),
      claude
    )
    expect(rows).toEqual([])
  })

  it('applies the default group ratio from usable_group before group_ratio', () => {
    const models = [
      model({ model_name: 'claude-sonnet-5-5', completion_ratio: 2 }),
    ]
    expect(
      resolveDefaultGroupRatio(
        pricing(models, {
          usable_group: { default: { desc: '', ratio: 1.5 } },
          group_ratio: { default: 2 },
        })
      )
    ).toBe(1.5)
    expect(
      resolveDefaultGroupRatio(pricing(models, { group_ratio: { default: 2 } }))
    ).toBe(2)
    expect(resolveDefaultGroupRatio(pricing(models))).toBe(1)
    expect(
      buildFeaturedRows(
        pricing(models, { group_ratio: { default: 2 } }),
        claude
      )[0]
    ).toMatchObject({ inputUSD: 4, outputUSD: 8 })
  })
})

describe('formatUsdPerMillion', () => {
  it('keeps two to three decimals without trailing zeros, and a dash for unavailable', () => {
    expect(formatUsdPerMillion(15)).toBe('$15.00')
    expect(formatUsdPerMillion(0.3)).toBe('$0.30')
    expect(formatUsdPerMillion(0.125)).toBe('$0.125')
    expect(formatUsdPerMillion(0.005)).toBe('$0.005')
    expect(formatUsdPerMillion(null)).toBe('—')
  })
})
