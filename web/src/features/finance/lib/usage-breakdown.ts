import type {
  FinanceRatioValue,
  FinanceUnitPrices,
  UsageGroupModelRow,
} from '../types'

export interface UsageGroupNode {
  group: string
  label: string
  count: number
  quota: number
  amountUsd: number
  modelCount: number
  percentage: number
  groupRatio: FinanceRatioValue | null
  groupRatioExclusive: boolean
  models: UsageGroupModelRow[]
}

/** 按令牌分组 → 模型 两层：分组行汇总次数 / 金额 / 模型数，模型行即后端行（已按金额降序） */
export function buildUsageGroups(
  rows: UsageGroupModelRow[],
  totalQuota: number,
  ungroupedLabel: string
): UsageGroupNode[] {
  const groups = new Map<string, UsageGroupNode>()
  for (const row of rows) {
    const node = groups.get(row.group) ?? {
      group: row.group,
      label: row.group ? row.group_label || row.group : ungroupedLabel,
      count: 0,
      quota: 0,
      amountUsd: 0,
      modelCount: 0,
      percentage: 0,
      groupRatio: null,
      groupRatioExclusive: false,
      models: [],
    }
    groups.set(row.group, node)
    node.count += row.count
    node.quota += row.quota
    node.amountUsd += Number.parseFloat(row.amount_usd) || 0
    node.modelCount += 1
    node.models.push(row)
    if (!node.groupRatio && row.ratios.group_ratio) {
      node.groupRatio = row.ratios.group_ratio
      node.groupRatioExclusive = row.ratios.group_ratio_exclusive
    }
  }
  const nodes = [...groups.values()]
  for (const node of nodes) {
    node.percentage = totalQuota > 0 ? (node.quota / totalQuota) * 100 : 0
    node.models.sort((a, b) => b.quota - a.quota)
  }
  return nodes.sort((a, b) => b.quota - a.quota)
}

/** 期内任一行有 1h 缓存写入时，表格才拆出 5m / 1h 两列 */
export function hasCacheWrite1h(
  rows: Pick<UsageGroupModelRow, 'cache_creation_1h_tokens'>[]
): boolean {
  return rows.some((row) => row.cache_creation_1h_tokens > 0)
}

/** 涉及模型数：跨分组按模型名去重 */
export function countDistinctModels(
  rows: Pick<UsageGroupModelRow, 'model_name'>[]
): number {
  return new Set(rows.map((row) => row.model_name)).size
}

/** 单价展示：空值为 -，小于 0.01 时保留 6 位，否则 4 位 */
export function formatUnitPrice(value: number | null | undefined): string {
  if (value == null) return '-'
  return value < 0.01 ? value.toFixed(6) : value.toFixed(4)
}

export type UnitPriceKey = keyof FinanceUnitPrices

/** 倍率展示：主值；多个取值时返回 shares 供提示 */
export function describeRatio(
  ratio: FinanceRatioValue | null,
  totalQuota: number
): { text: string; shares: { value: number; percent: number }[] } | null {
  if (!ratio) return null
  const shares = (ratio.shares ?? []).map((share) => ({
    value: share.value,
    percent: totalQuota > 0 ? (share.quota / totalQuota) * 100 : 0,
  }))
  return { text: formatRatioValue(ratio.value), shares }
}

export function formatRatioValue(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(4)))
}
