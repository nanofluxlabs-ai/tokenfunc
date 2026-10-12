import type { DayRange } from '@/features/finance/lib/date-presets'

// 区间口径与后端一致：计费时区（Asia/Shanghai，UTC+8，无夏令时）自然日闭区间，
// 接口参数 start_date / end_date（YYYY-MM-DD）。默认「今天」按计费时区取日历日，
// 避免海外浏览器本地时区与后端口径差一天。

const BILLING_OFFSET_MS = 8 * 3600 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 把一个 UTC 日历日（year/month/day 取自平移后的 UTC 分量）格式化为 YYYY-MM-DD */
function formatUtcDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** 计费时区的日历日（偏移 offsetDays 天），返回 YYYY-MM-DD */
export function billingCalendarDay(offsetDays = 0, now = Date.now()): string {
  const shifted = new Date(now + BILLING_OFFSET_MS)
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays)
  return formatUtcDay(shifted)
}

/** 计费时区当月 1 日，返回 YYYY-MM-DD */
export function billingMonthFirstDay(now = Date.now()): string {
  const shifted = new Date(now + BILLING_OFFSET_MS)
  shifted.setUTCDate(1)
  return formatUtcDay(shifted)
}

/** 零点时间戳（秒）→ 计费时区的 YYYY-MM-DD，与浏览器时区无关 */
export function formatBillingDate(ts: number): string {
  return formatUtcDay(new Date(ts * 1000 + BILLING_OFFSET_MS))
}

export type BillingDatePresetId =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'month'

export const BILLING_DATE_PRESETS: BillingDatePresetId[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'month',
]

/** 快捷区间，全部按计费时区计算 */
export function billingPresetRange(
  preset: BillingDatePresetId,
  now = Date.now()
): DayRange {
  const today = billingCalendarDay(0, now)
  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'yesterday': {
      const yesterday = billingCalendarDay(-1, now)
      return { start: yesterday, end: yesterday }
    }
    case 'last7':
      return { start: billingCalendarDay(-6, now), end: today }
    case 'last30':
      return { start: billingCalendarDay(-29, now), end: today }
    case 'month':
      return { start: billingMonthFirstDay(now), end: today }
  }
}

/** 默认区间：计费时区的今天 */
export function billingTodayRange(now = Date.now()): DayRange {
  return billingPresetRange('today', now)
}
