import type { PricingData } from '@/features/pricing/types'

import type { FeaturedVendor } from '../content'
import { computeListPrices } from './list-prices'

export type LandingModelRow = {
  id: string
  tag: string
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

/**
 * 按精选配置从系统定价里取价：model_name 精确匹配、只取按 token 计费的模型，
 * 接口里没有的模型直接跳过（不回退写死价格），顺序与配置一致。
 */
export function buildFeaturedRows(
  data: PricingData,
  vendor: FeaturedVendor
): LandingModelRow[] {
  const groupRatio = resolveDefaultGroupRatio(data)
  const byName = new Map(
    (data.data ?? [])
      .filter((model) => model.quota_type === 0)
      .map((model) => [model.model_name, model])
  )
  const rows: LandingModelRow[] = []
  for (const featured of vendor.models) {
    const model = byName.get(featured.id)
    if (!model) continue
    const prices = computeListPrices(model, groupRatio)
    rows.push({
      id: featured.id,
      tag: featured.tag,
      inputUSD: prices.input,
      cacheUSD: prices.cache,
      outputUSD: prices.output,
    })
  }
  return rows
}

// 价目固定按美元展示，与界面语言无关，用合法的固定语言标签
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
})

/** 价目表美元：至少 2 位、最多 3 位小数，去掉多余的 0（$15.00、$0.30、$0.125） */
export function formatUsdPerMillion(value: number | null): string {
  if (value === null) return '—'
  return usdFormatter.format(value)
}
