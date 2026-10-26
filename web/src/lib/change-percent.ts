/** 本期对上期的变化百分比（保留一位小数），日环比 / 周环比 / 月环比共用；上期为 0 时无从比较返回 null */
export function changePercent(
  current: number,
  previous: number
): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}
