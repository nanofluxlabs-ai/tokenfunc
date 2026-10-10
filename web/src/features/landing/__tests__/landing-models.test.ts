import { describe, expect, it } from 'vitest'

import type { PricingData, PricingModel } from '@/features/pricing/types'

import {
  buildLandingModelRows,
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

describe('buildLandingModelRows', () => {
  it('keeps only token-billed models from the four landing vendors, sorted by vendor then price', () => {
    const rows = buildLandingModelRows(
      pricing([
        model({
          model_name: 'gpt-5',
          vendor_name: 'OpenAI',
          model_ratio: 0.625,
          completion_ratio: 8,
          cache_ratio: 0.1,
        }),
        model({
          model_name: 'claude-sonnet-4.5',
          vendor_name: 'Anthropic',
          model_ratio: 1.5,
          completion_ratio: 5,
          cache_ratio: 0.1,
        }),
        model({
          model_name: 'claude-opus-4.1',
          vendor_name: 'Anthropic',
          model_ratio: 7.5,
          completion_ratio: 5,
        }),
        model({
          model_name: 'deepseek-chat',
          vendor_name: 'DeepSeek',
          model_ratio: 0.1,
          completion_ratio: 2,
        }),
        model({
          model_name: 'dall-e-3',
          vendor_name: 'OpenAI',
          quota_type: 1,
          model_ratio: 1,
          completion_ratio: 1,
        }),
      ])
    )

    expect(rows.map((row) => row.id)).toEqual([
      'claude-opus-4.1',
      'claude-sonnet-4.5',
      'gpt-5',
    ])
    expect(rows[1]).toMatchObject({
      vendorLabel: 'Claude',
      inputUSD: 3,
      outputUSD: 15,
      cacheUSD: 0.3,
    })
    expect(rows[0].cacheUSD).toBeNull()
  })

  it('matches Grok models by name when the vendor is unnamed', () => {
    const rows = buildLandingModelRows(
      pricing([
        model({
          model_name: 'grok-4-fast',
          model_ratio: 0.1,
          completion_ratio: 2.5,
        }),
      ])
    )
    expect(rows[0]).toMatchObject({
      vendorKey: 'xai',
      vendorLabel: 'Grok',
      inputUSD: 0.2,
      outputUSD: 0.5,
    })
  })

  it('applies the default group ratio from usable_group before group_ratio', () => {
    const models = [
      model({
        model_name: 'gpt-5',
        vendor_name: 'OpenAI',
        model_ratio: 1,
        completion_ratio: 2,
      }),
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
      buildLandingModelRows(pricing(models, { group_ratio: { default: 2 } }))[0]
    ).toMatchObject({ inputUSD: 4, outputUSD: 8 })
  })
})

describe('formatUsdPerMillion', () => {
  it('uses three decimals below one dollar, two otherwise, and a dash for unavailable', () => {
    expect(formatUsdPerMillion(0.25)).toBe('$0.250')
    expect(formatUsdPerMillion(15)).toBe('$15.00')
    expect(formatUsdPerMillion(null)).toBe('—')
  })
})
