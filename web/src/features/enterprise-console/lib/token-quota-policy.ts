import { z } from 'zod'

import type { TokenQuotaPolicyPayload, TokenQuotaResetPeriod } from '../types'

/** 周期边界按后端账期时区（上海，无夏令时）切分，预览必须与后端一致 */
export const TOKEN_QUOTA_RESET_TIME_ZONE = 'Asia/Shanghai'
const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000

/** 自定义周期的小时范围：1 小时～366 天（与后端 custom_seconds 的范围一致） */
export const TOKEN_QUOTA_CUSTOM_MIN_HOURS = 1
export const TOKEN_QUOTA_CUSTOM_MAX_HOURS = 366 * 24

/** 周期选项与文案键；never 单独处理（删除策略） */
export const TOKEN_QUOTA_RESET_PERIODS: {
  value: Exclude<TokenQuotaResetPeriod, 'never'>
  labelKey: string
}[] = [
  { value: 'daily', labelKey: 'Daily' },
  { value: 'weekly', labelKey: 'Weekly' },
  { value: 'monthly', labelKey: 'Monthly' },
  { value: 'custom', labelKey: 'Custom' },
]

/** 表单里的周期限额草稿：金额以展示货币计、自定义周期以小时计 */
export interface TokenQuotaPolicyDraft {
  reset_period: TokenQuotaResetPeriod
  custom_hours: number
  period_quota_dollars: number
}

export const DEFAULT_TOKEN_QUOTA_POLICY_DRAFT: TokenQuotaPolicyDraft = {
  reset_period: 'daily',
  custom_hours: 24,
  period_quota_dollars: 0,
}

/** 草稿的 zod 形状（不含业务校验，校验见 tokenQuotaPolicyIssues） */
export const tokenQuotaPolicyDraftShape = z.object({
  reset_period: z.enum(['never', 'daily', 'weekly', 'monthly', 'custom']),
  custom_hours: z.number(),
  period_quota_dollars: z.number(),
})

/**
 * 业务校验：never 不校验金额；其余金额必须大于 0；custom 的小时数必须是范围内的整数。
 * 返回挂在子字段上的问题列表，由调用方 addIssue（可加路径前缀）
 */
export function tokenQuotaPolicyIssues(
  draft: TokenQuotaPolicyDraft,
  t: (key: string) => string
): { path: keyof TokenQuotaPolicyDraft; message: string }[] {
  if (draft.reset_period === 'never') return []
  const issues: { path: keyof TokenQuotaPolicyDraft; message: string }[] = []
  if (!(draft.period_quota_dollars > 0)) {
    issues.push({
      path: 'period_quota_dollars',
      message: t('Period quota must be greater than 0'),
    })
  }
  if (
    draft.reset_period === 'custom' &&
    (!Number.isInteger(draft.custom_hours) ||
      draft.custom_hours < TOKEN_QUOTA_CUSTOM_MIN_HOURS ||
      draft.custom_hours > TOKEN_QUOTA_CUSTOM_MAX_HOURS)
  ) {
    issues.push({
      path: 'custom_hours',
      message: t('Custom period must be between 1 and 8784 hours'),
    })
  }
  return issues
}

/** 独立表单用的 schema（策略对话框） */
export function tokenQuotaPolicySchema(t: (key: string) => string) {
  return tokenQuotaPolicyDraftShape.superRefine((draft, ctx) => {
    for (const issue of tokenQuotaPolicyIssues(draft, t)) {
      ctx.addIssue({
        code: 'custom',
        path: [issue.path],
        message: issue.message,
      })
    }
  })
}

/** 草稿 → 请求体（金额换算交给调用方传入的 parseQuota，保持与 @/lib/format 的精度一致） */
export function toTokenQuotaPolicyPayload(
  draft: TokenQuotaPolicyDraft,
  parseQuota: (dollars: number) => number
): TokenQuotaPolicyPayload {
  if (draft.reset_period === 'never') {
    return { reset_period: 'never', custom_seconds: 0, period_quota: 0 }
  }
  return {
    reset_period: draft.reset_period,
    custom_seconds:
      draft.reset_period === 'custom' ? draft.custom_hours * 3600 : 0,
    period_quota: parseQuota(draft.period_quota_dollars),
  }
}

/** 上海时区的日历日：年、月（1-12）、日、周几（0=周日） */
function shanghaiCalendarDay(nowMs: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TOKEN_QUOTA_RESET_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(new Date(nowMs))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    weekday: weekdays.indexOf(read('weekday')),
  }
}

/** 上海时区某天 00:00 的时间戳（毫秒）；day 可越界，由 Date.UTC 归一化 */
function shanghaiMidnightMs(year: number, month: number, day: number) {
  return Date.UTC(year, month - 1, day) - SHANGHAI_OFFSET_MS
}

/**
 * 预览下一次重置时刻（毫秒），与后端 NextTokenQuotaResetAt 同口径：
 * daily 次日 00:00、weekly 下周一 00:00、monthly 下月 1 日 00:00、custom = now + 小时数；never 返回 null
 */
export function previewNextResetAt(
  draft: Pick<TokenQuotaPolicyDraft, 'reset_period' | 'custom_hours'>,
  nowMs: number
): number | null {
  if (draft.reset_period === 'never') return null
  if (draft.reset_period === 'custom') {
    return nowMs + draft.custom_hours * 3600 * 1000
  }
  const today = shanghaiCalendarDay(nowMs)
  if (draft.reset_period === 'daily') {
    return shanghaiMidnightMs(today.year, today.month, today.day + 1)
  }
  if (draft.reset_period === 'weekly') {
    // 距下周一的天数：周一当天算 7 天后
    const days = (1 - today.weekday + 7) % 7 || 7
    return shanghaiMidnightMs(today.year, today.month, today.day + days)
  }
  return shanghaiMidnightMs(today.year, today.month + 1, 1)
}

/** 重置时刻按上海时区展示为 MM-DD HH:mm */
export function formatResetTime(
  timestampMs: number,
  locale: Intl.LocalesArgument
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TOKEN_QUOTA_RESET_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestampMs))
}
