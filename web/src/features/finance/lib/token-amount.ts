const TOKEN_UNITS = ['K', 'M', 'B', 'T'] as const

/**
 * Token 数量按千进位换算单位并保留 2 位小数：512、1.23K、4.56M、7.89B。
 * 进位后满 1000 的（如 999,999 → 1000.00K）升到下一个单位，避免出现 1000.00K。
 * 上游 `formatTokens`（K 1 位、无 B）与排行榜的按量级变精度都不满足账单的统一 2 位，二开单独实现。
 */
export function formatTokenAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(Math.round(value))
  let scaled = value
  for (const unit of TOKEN_UNITS) {
    scaled /= 1000
    const rounded = Number(scaled.toFixed(2))
    if (rounded < 1000 || unit === TOKEN_UNITS.at(-1)) {
      return `${rounded.toFixed(2)}${unit}`
    }
  }
  return String(value)
}
