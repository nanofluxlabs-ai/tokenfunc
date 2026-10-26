import { formatTimestampToDate } from '@/lib/format'

/** 账期日期只到天：账期区间是半开 [start, end)，展示时结束日取 end - 1 */
export function billDay(timestamp: number): string {
  return formatTimestampToDate(timestamp).slice(0, 10)
}
