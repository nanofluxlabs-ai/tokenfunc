import type { PricingModel } from '@/features/pricing/types'

/** 挂牌价（USD / 1M tokens）：模型倍率 × 2 × 分组倍率；缓存价不可用时为 null */
export type ListPrices = { input: number; output: number; cache: number | null }

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

export function computeListPrices(
  model: PricingModel,
  groupRatio: number
): ListPrices {
  const base = model.model_ratio * 2 * groupRatio
  const cacheRatio = model.cache_ratio
  const hasCache =
    cacheRatio !== undefined &&
    cacheRatio !== null &&
    Number.isFinite(Number(cacheRatio))
  return {
    input: round4(base),
    output: round4(base * model.completion_ratio),
    cache: hasCache ? round4(base * Number(cacheRatio)) : null,
  }
}

export function applyDiscount(price: number, discountPercent: number): number {
  return round4(price * (1 - discountPercent / 100))
}

/** 报价单只支持按 token 计费、非任务类的模型 */
export function isQuotableModel(model: PricingModel): boolean {
  return (
    model.quota_type === 0 &&
    Object.keys(model.billing_usage_schema ?? {}).length === 0
  )
}
