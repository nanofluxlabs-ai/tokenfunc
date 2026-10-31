import dayjs from '@/lib/dayjs'

export type DayRange = { start: string; end: string }

export type DatePresetId = 'today' | 'week' | 'month' | 'lastMonth' | 'last30'

/** 财务中心各 tab 的快捷档 */
export const FINANCE_DATE_PRESETS: DatePresetId[] = [
  'today',
  'week',
  'month',
  'lastMonth',
]

const DAY = 'YYYY-MM-DD'

// 日期区间一律按计费时区（Asia/Shanghai，UTC+8，无夏令时）的自然日计算，与后端
// model.BillingLocation() 口径一致：start_date / end_date 由后端按上海时区解释，
// ts_start / ts_end 也要落在上海时区的零点，否则海外浏览器会整体错开一天。
const BILLING_OFFSET_MS = 8 * 3600 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 把一个 UTC 日历日（year/month/day 取自平移后的 UTC 分量）格式化为 YYYY-MM-DD */
function formatUtcDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** 当前时刻平移到计费时区后的「UTC 分量即本地分量」日期 */
function billingShifted(now: number): Date {
  return new Date(now + BILLING_OFFSET_MS)
}

/** 计费时区的日历日（偏移 offsetDays 天），返回 YYYY-MM-DD */
export function billingCalendarDay(offsetDays = 0, now = Date.now()): string {
  const shifted = billingShifted(now)
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays)
  return formatUtcDay(shifted)
}

/** 计费时区当月 1 日，返回 YYYY-MM-DD */
export function billingMonthFirstDay(now = Date.now()): string {
  const shifted = billingShifted(now)
  shifted.setUTCDate(1)
  return formatUtcDay(shifted)
}

/** 零点时间戳（秒）→ 计费时区的 YYYY-MM-DD，与浏览器时区无关 */
export function formatBillingDate(ts: number): string {
  return formatUtcDay(new Date(ts * 1000 + BILLING_OFFSET_MS))
}

/** 日期选择器的 Date（本地零点）→ YYYY-MM-DD；只做日期标签转换，不涉及时区口径 */
export function formatDay(date: Date): string {
  return dayjs(date).format(DAY)
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** YYYY-MM-DD → 本地日期（供日期选择器显示）；格式或日期非法时返回 undefined（项目未启用 customParseFormat，用正则 + dayjs 默认解析） */
export function parseDay(value?: string): Date | undefined {
  if (!value || !DAY_PATTERN.test(value)) return undefined
  const parsed = dayjs(value)
  return parsed.isValid() && parsed.format(DAY) === value
    ? parsed.toDate()
    : undefined
}

/** 经营看板 / 订单中心默认：计费时区本月 1 日 ~ 今天 */
export function monthToDateRange(now = new Date()): DayRange {
  return presetRange('month', now)
}

/** 用户消耗 / 模型消费默认：计费时区的今天 */
export function todayRange(now = new Date()): DayRange {
  return presetRange('today', now)
}

/**
 * 快捷区间，全部按计费时区计算，终点都不超过今天：
 * 本周 = 周一 ~ 今天；本月 = 1 日 ~ 今天；上月 = 上月整月；近 30 天含今天。
 */
export function presetRange(preset: DatePresetId, now = new Date()): DayRange {
  const nowMs = now.getTime()
  const today = billingCalendarDay(0, nowMs)
  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'week': {
      // getUTCDay：周日 0 … 周六 6；换算成距本周一的天数
      const sinceMonday = (billingShifted(nowMs).getUTCDay() + 6) % 7
      return { start: billingCalendarDay(-sinceMonday, nowMs), end: today }
    }
    case 'month':
      return { start: billingMonthFirstDay(nowMs), end: today }
    case 'lastMonth': {
      const firstOfMonth = billingShifted(nowMs)
      firstOfMonth.setUTCDate(1)
      const lastOfPrevious = new Date(firstOfMonth)
      lastOfPrevious.setUTCDate(0)
      const firstOfPrevious = new Date(lastOfPrevious)
      firstOfPrevious.setUTCDate(1)
      return {
        start: formatUtcDay(firstOfPrevious),
        end: formatUtcDay(lastOfPrevious),
      }
    }
    case 'last30':
      return { start: billingCalendarDay(-29, nowMs), end: today }
  }
}

// 多个快捷档区间相同时（如 1 号的「今天」与「本月」）优先高亮周期长的
const PRESET_MATCH_PRIORITY: DatePresetId[] = [
  'lastMonth',
  'last30',
  'month',
  'week',
  'today',
]

/**
 * 当前区间对应的快捷档（用于高亮）；preferred 为用户刚点的档，区间仍吻合时优先用它。
 * 自定义区间都不吻合时返回 null。
 */
export function matchDatePreset(
  range: DayRange,
  presets: DatePresetId[],
  preferred?: DatePresetId | null,
  now = new Date()
): DatePresetId | null {
  const matches = (preset: DatePresetId) => {
    const candidate = presetRange(preset, now)
    return candidate.start === range.start && candidate.end === range.end
  }
  if (preferred && presets.includes(preferred) && matches(preferred)) {
    return preferred
  }
  return (
    PRESET_MATCH_PRIORITY.find(
      (preset) => presets.includes(preset) && matches(preset)
    ) ?? null
  )
}

/** YYYY-MM-DD（计费时区）→ 当天零点的秒级时间戳 */
function billingDayStartUnix(day: string, offsetDays = 0): number {
  const [year, month, date] = day.split('-').map(Number)
  return (
    (Date.UTC(year, month - 1, date + offsetDays) - BILLING_OFFSET_MS) / 1000
  )
}

/** 计费时区日期 → 闭区间秒级时间戳 [起始日 00:00:00, 结束日 23:59:59] */
export function dayRangeToTimestamps(range: DayRange): {
  ts_start: number
  ts_end: number
} {
  return {
    ts_start: billingDayStartUnix(range.start),
    ts_end: billingDayStartUnix(range.end, 1) - 1,
  }
}

/** 规范化：缺失或起止颠倒时回退到 fallback */
export function normalizeDayRange(
  start: string | undefined,
  end: string | undefined,
  fallback: DayRange
): DayRange {
  if (!start || !end || start > end) return fallback
  return { start, end }
}
