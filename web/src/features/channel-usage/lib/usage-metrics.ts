import type {
  ChannelUsageAmount,
  ChannelUsageItem,
  ChannelUsageMetric,
} from '../types'

/** 渠道行可展开 = 所选区间内有调用 */
export function isChannelExpandable(channel: ChannelUsageItem): boolean {
  return (channel.range_call_count || 0) > 0
}

/** 按所选口径取金额：actual = 实际扣费，其余 = 官方价值 */
export function metricValue(
  amount: ChannelUsageAmount | null | undefined,
  metric: ChannelUsageMetric
): number {
  if (!amount) return 0
  return metric === 'actual' ? amount.quota || 0 : amount.official_quota || 0
}

/** 占比百分数（0~100），分母非正时为 0 */
export function sharePercent(value: number, total: number): number {
  if (!total || total <= 0 || !value) return 0
  return Math.min(100, Math.max(0, (value / total) * 100))
}

/** 占比文案：<1% / 一位小数（<10%）/ 整数 */
export function formatShare(value: number, total: number): string {
  const pct = sharePercent(value, total)
  if (pct <= 0) return '0%'
  if (pct < 1) return '<1%'
  return `${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`
}

/** 解析 URL 里的展开行 id 列表（逗号分隔的正整数） */
export function parseExpandIds(value: string | undefined): number[] {
  if (!value) return []
  return value
    .split(',')
    .map((part) => Number.parseInt(part, 10))
    .filter((id) => Number.isInteger(id) && id > 0)
}

/** 预付客户的可用天数估算；返回 null 表示无法估算或余额已用尽 */
export function estimateRunwayDays(
  remainQuota: number,
  avgDailyConsume: number
): number | null {
  if (avgDailyConsume <= 0 || remainQuota <= 0) return null
  return remainQuota / avgDailyConsume
}
