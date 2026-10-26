import dayjs from 'dayjs'

import type { UsageDayItem, UsageGroupBy, UsageSummaryItem } from '../types'

/** 用量报表快捷区间；概览下钻时也按这几档对齐 */
export type UsageRangePreset = 'today' | '7d' | 'month' | '30d'

export const USAGE_RANGE_PRESETS: {
  value: UsageRangePreset
  labelKey: string
}[] = [
  { value: 'today', labelKey: 'Today' },
  { value: '7d', labelKey: 'Last 7 days' },
  { value: 'month', labelKey: 'Month to date' },
  { value: '30d', labelKey: 'Last 30 days' },
]

export type UsageDayRange = { from: string; to: string }

const DAY_FORMAT = 'YYYY-MM-DD'

/** 快捷区间对应的起止日期（含首尾）；today 参数便于概览用服务端的“今天”对齐 */
export function usageRangeFromPreset(
  preset: UsageRangePreset,
  today: string = dayjs().format(DAY_FORMAT)
): UsageDayRange {
  const end = dayjs(today)
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: end.subtract(6, 'day').format(DAY_FORMAT), to: today }
    case '30d':
      return { from: end.subtract(29, 'day').format(DAY_FORMAT), to: today }
    case 'month':
      return { from: end.startOf('month').format(DAY_FORMAT), to: today }
  }
}

/** 当前区间命中哪个快捷档（用于高亮按钮）；都不命中返回 null */
export function matchUsagePreset(
  range: UsageDayRange,
  today: string = dayjs().format(DAY_FORMAT)
): UsageRangePreset | null {
  const hit = USAGE_RANGE_PRESETS.find((preset) => {
    const candidate = usageRangeFromPreset(preset.value, today)
    return candidate.from === range.from && candidate.to === range.to
  })
  return hit?.value ?? null
}

/** 按日汇总补齐区间内缺失的日期（升序）；后端 group_by=day 只返回有用量的日子 */
export function fillUsageDays(
  items: UsageSummaryItem[],
  range: UsageDayRange
): UsageDayItem[] {
  const byDay = new Map(items.map((item) => [item.key_name, item]))
  const days: UsageDayItem[] = []
  const end = dayjs(range.to)
  for (
    let day = dayjs(range.from);
    !day.isAfter(end);
    day = day.add(1, 'day')
  ) {
    const key = day.format(DAY_FORMAT)
    const item = byDay.get(key)
    days.push({
      day: key,
      quota: item?.quota ?? 0,
      request_count: item?.request_count ?? 0,
      prompt_tokens: item?.prompt_tokens ?? 0,
      completion_tokens: item?.completion_tokens ?? 0,
      cache_tokens: item?.cache_tokens ?? 0,
    })
  }
  return days
}

/** 占比百分比（一位小数）；合计为 0 时为 0 */
export function sharePercent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 1000) / 10
}

/** 深链维度对应的归属页签；团队角色没有「团队」页签 */
export function usageAttributionFor(
  group: UsageGroupBy | undefined,
  hideTeamDimension?: boolean
): Extract<UsageGroupBy, 'team' | 'member' | 'token'> {
  if (group === 'member' || group === 'token') return group
  if (group === 'team' && !hideTeamDimension) return 'team'
  return hideTeamDimension ? 'member' : 'team'
}
