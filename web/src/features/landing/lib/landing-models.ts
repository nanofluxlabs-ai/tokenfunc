import type { PricingData, PricingModel } from '@/features/pricing/types'
import { computeListPrices } from '@/features/quotes/lib/quote-pricing'

import { LANDING_VENDORS } from '../content'

export type LandingModelRow = {
  id: string
  vendorKey: string
  vendorLabel: string
  inputUSD: number
  cacheUSD: number | null
  outputUSD: number
}

/** 默认分组倍率：优先 usable_group.default，其次 group_ratio.default，否则 1 */
export function resolveDefaultGroupRatio(data: PricingData): number {
  const usable = data.usable_group?.default?.ratio
  if (typeof usable === 'number' && Number.isFinite(usable)) return usable
  const ratio = data.group_ratio?.default
  if (typeof ratio === 'number' && Number.isFinite(ratio)) return ratio
  return 1
}

function matchVendor(model: PricingModel) {
  const haystack = `${model.vendor_name ?? ''} ${model.model_name}`
  return LANDING_VENDORS.find((vendor) => vendor.match.test(haystack))
}

/**
 * 把系统定价收敛成营销页价目：只保留四家厂商、按 token 计费的模型，
 * 价格按"模型倍率 × 2 × 默认分组倍率"换算成 USD / 1M tokens。
 */
export function buildLandingModelRows(data: PricingData): LandingModelRow[] {
  const groupRatio = resolveDefaultGroupRatio(data)
  const rows: LandingModelRow[] = []
  for (const model of data.data ?? []) {
    if (model.quota_type !== 0) continue
    const vendor = matchVendor(model)
    if (!vendor) continue
    const prices = computeListPrices(model, groupRatio)
    rows.push({
      id: model.model_name,
      vendorKey: vendor.key,
      vendorLabel: vendor.label,
      inputUSD: prices.input,
      cacheUSD: prices.cache,
      outputUSD: prices.output,
    })
  }
  const order = new Map(
    LANDING_VENDORS.map((vendor, index) => [vendor.key, index])
  )
  return rows.sort((a, b) => {
    const byVendor =
      (order.get(a.vendorKey) ?? 99) - (order.get(b.vendorKey) ?? 99)
    if (byVendor !== 0) return byVendor
    return b.inputUSD - a.inputUSD
  })
}

/** 价目表里的美元展示：小于 1 美元保留 3 位，否则 2 位 */
export function formatUsdPerMillion(value: number | null): string {
  if (value === null) return '—'
  return `$${value.toFixed(value < 1 ? 3 : 2)}`
}
