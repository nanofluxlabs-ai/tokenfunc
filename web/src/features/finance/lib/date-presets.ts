import dayjs from '@/lib/dayjs'

export type DayRange = { start: string; end: string }

export type DatePresetId = 'today' | 'month' | 'lastMonth' | 'last30'

const DAY = 'YYYY-MM-DD'

export function formatDay(date: Date): string {
  return dayjs(date).format(DAY)
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** YYYY-MM-DD → 本地日期；格式或日期非法时返回 undefined（项目未启用 customParseFormat，用正则 + dayjs 默认解析） */
export function parseDay(value?: string): Date | undefined {
  if (!value || !DAY_PATTERN.test(value)) return undefined
  const parsed = dayjs(value)
  return parsed.isValid() && parsed.format(DAY) === value
    ? parsed.toDate()
    : undefined
}

/** 经营看板 / 订单中心默认：本月 1 日 ~ 今天 */
export function monthToDateRange(now = new Date()): DayRange {
  return { start: dayjs(now).startOf('month').format(DAY), end: formatDay(now) }
}

/** 用户消耗 / 模型消费默认：今天 */
export function todayRange(now = new Date()): DayRange {
  const today = formatDay(now)
  return { start: today, end: today }
}

/** 用户消耗详情页的快捷区间；「本月」「上月」都截到当月最后一天，与 tokensolo 一致 */
export function presetRange(preset: DatePresetId, now = new Date()): DayRange {
  const current = dayjs(now)
  switch (preset) {
    case 'today':
      return todayRange(now)
    case 'month':
      return {
        start: current.startOf('month').format(DAY),
        end: current.endOf('month').format(DAY),
      }
    case 'lastMonth': {
      const lastMonth = current.subtract(1, 'month')
      return {
        start: lastMonth.startOf('month').format(DAY),
        end: lastMonth.endOf('month').format(DAY),
      }
    }
    case 'last30':
      return {
        start: current.subtract(29, 'day').format(DAY),
        end: formatDay(now),
      }
  }
}

/** 本地日期 → 闭区间秒级时间戳 [当天 00:00:00, 当天 23:59:59] */
export function dayRangeToTimestamps(range: DayRange): {
  ts_start: number
  ts_end: number
} {
  return {
    ts_start: dayjs(range.start).startOf('day').unix(),
    ts_end: dayjs(range.end).endOf('day').unix(),
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
