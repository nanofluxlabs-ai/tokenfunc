import {
  billingCalendarDay,
  billingMonthFirstDay,
  type DayRange,
} from '@/features/finance/lib/date-presets'

// 区间口径与后端一致：计费时区（Asia/Shanghai，UTC+8，无夏令时）自然日闭区间，
// 接口参数 start_date / end_date（YYYY-MM-DD）。计费时区的日期换算与财务中心共用
// features/finance/lib/date-presets，这里只保留渠道用量自己的快捷档。
export {
  billingCalendarDay,
  billingMonthFirstDay,
  formatBillingDate,
} from '@/features/finance/lib/date-presets'

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
