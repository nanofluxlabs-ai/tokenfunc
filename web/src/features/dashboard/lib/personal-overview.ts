import type { FlowQuotaDataItem, QuotaDataItem } from '../types'

/** 个人概览的区间档位：7 天 / 30 天 */
export type PersonalRangeDays = 7 | 30

/** 趋势图指标：消耗额度 / 请求数 / Token */
export type PersonalMetric = 'quota' | 'count' | 'tokens'

export type PersonalTotals = { quota: number; count: number; tokens: number }

/** 单日汇总；models 是该日按模型拆分的三项指标 */
export type PersonalDayRow = PersonalTotals & {
  day: string
  models: Map<string, PersonalTotals>
}

/** 区间内参与图表的模型：Top N 按消耗额度排序，其余并入 other（name 为 null） */
export type PersonalModelShare = PersonalTotals & {
  /** 趋势图字段名，m0..m(N-1) / other；颜色按该序号固定分配 */
  field: string
  name: string | null
}

export type PersonalRangeBreakdown = {
  /** 按日期升序，含无数据的空白日 */
  days: PersonalDayRow[]
  models: PersonalModelShare[]
  totals: PersonalTotals
}

export type PersonalHeatmapCell = { day: string; hour: number; count: number }

export type PersonalSnapshot = {
  today: PersonalTotals
  /** 昨日 0 点到昨日同一整点（含当前小时桶），与今日已过时段对齐 */
  yesterdaySamePeriod: PersonalTotals
  monthToDate: PersonalTotals
  /** 上月 1 日到上月同日同一整点；上月更短时截到上月末 */
  lastMonthSamePeriod: PersonalTotals
  /** 最近 7 天（含今天），按日期升序，用于迷你图 */
  last7Days: PersonalDayRow[]
  /** 今天之前 7 个完整自然日的日均消耗，没有则退化为今日消耗；用于估算余额可用天数 */
  dailyAverageQuota: number
}

export const PERSONAL_TOP_MODEL_COUNT = 5
export const PERSONAL_HEATMAP_DAYS = 7
const HOUR_MS = 3600 * 1000

function emptyTotals(): PersonalTotals {
  return { quota: 0, count: 0, tokens: 0 }
}

function addInto(target: PersonalTotals, row: QuotaDataItem): void {
  target.quota += Number(row.quota) || 0
  target.count += Number(row.count) || 0
  target.tokens += Number(row.token_used) || 0
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** 本地时区的 YYYY-MM-DD */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 一次取数的起点：覆盖 30 天区间与「上月同期」两种需求，取二者较早者。
 * 月初时上月 1 日更早；月末时 30 天前更早（如 3 月 1 日，2 月只有 28 天）。
 */
export function personalFetchStart(now: Date): Date {
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const thirtyDaysStart = addDays(startOfDay(now), -29)
  return lastMonthStart < thirtyDaysStart ? lastMonthStart : thirtyDaysStart
}

/** 区间起点：今天往前 days-1 天的 0 点 */
export function personalRangeStart(now: Date, days: number): Date {
  return addDays(startOfDay(now), -(days - 1))
}

function sumBetween(rows: QuotaDataItem[], from: number, to: number) {
  const totals = emptyTotals()
  for (const row of rows) {
    const ms = row.created_at * 1000
    if (ms >= from && ms < to) addInto(totals, row)
  }
  return totals
}

/** 按天聚合 [start, end] 闭区间内的每一天（含空白日） */
function groupByDay(
  rows: QuotaDataItem[],
  start: Date,
  dayCount: number
): PersonalDayRow[] {
  const days: PersonalDayRow[] = []
  const index = new Map<string, PersonalDayRow>()
  for (let offset = 0; offset < dayCount; offset++) {
    const key = localDayKey(addDays(start, offset))
    const row: PersonalDayRow = { day: key, ...emptyTotals(), models: new Map() }
    days.push(row)
    index.set(key, row)
  }
  for (const item of rows) {
    const target = index.get(localDayKey(new Date(item.created_at * 1000)))
    if (!target) continue
    addInto(target, item)
    const model = item.model_name || '-'
    let modelTotals = target.models.get(model)
    if (!modelTotals) {
      modelTotals = emptyTotals()
      target.models.set(model, modelTotals)
    }
    addInto(modelTotals, item)
  }
  return days
}

/** KPI 与 Hero 需要的固定口径快照，与区间开关无关 */
export function buildPersonalSnapshot(
  rows: QuotaDataItem[],
  now: Date
): PersonalSnapshot {
  const todayStart = startOfDay(now)
  const yesterdayStart = addDays(todayStart, -1)
  // 按整点对齐：数据按小时落桶，今天当前小时的桶对应昨天同一小时的桶
  const elapsedHoursMs =
    Math.floor((now.getTime() - todayStart.getTime()) / HOUR_MS) * HOUR_MS +
    HOUR_MS
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthSameMoment = Math.min(
    new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate(),
      now.getHours() + 1
    ).getTime(),
    monthStart.getTime()
  )
  // 上月同日不存在时（如 3/31 → 2/31）Date 会溢出到本月，上面已截到本月 1 日
  const last7Days = groupByDay(rows, addDays(todayStart, -6), 7)
  const previous7 = groupByDay(rows, addDays(todayStart, -7), 7)
  const previous7Quota = previous7.reduce((sum, day) => sum + day.quota, 0)
  const today = sumBetween(rows, todayStart.getTime(), Number.POSITIVE_INFINITY)

  return {
    today,
    yesterdaySamePeriod: sumBetween(
      rows,
      yesterdayStart.getTime(),
      Math.min(
        yesterdayStart.getTime() + elapsedHoursMs,
        todayStart.getTime()
      )
    ),
    monthToDate: sumBetween(
      rows,
      monthStart.getTime(),
      Number.POSITIVE_INFINITY
    ),
    lastMonthSamePeriod: sumBetween(
      rows,
      lastMonthStart.getTime(),
      lastMonthSameMoment
    ),
    last7Days,
    dailyAverageQuota: previous7Quota > 0 ? previous7Quota / 7 : today.quota,
  }
}

/** 按模型汇总若干天 */
function sumByModel(days: PersonalDayRow[]): Map<string, PersonalTotals> {
  const byModel = new Map<string, PersonalTotals>()
  for (const day of days) {
    for (const [name, value] of day.models) {
      const current = byModel.get(name) ?? emptyTotals()
      current.quota += value.quota
      current.count += value.count
      current.tokens += value.tokens
      byModel.set(name, current)
    }
  }
  return byModel
}

/**
 * 区间开关对应的按天 + 按模型拆分。
 * 参与图表的模型与其顺序固定按近 30 天消耗取 Top N（颜色按顺序分配），7 / 30 天切换时同一模型颜色不变；
 * 数值取所选区间，Top N 在本区间无用量时数值为 0（由界面隐藏），其余模型并入「其他」。
 */
export function buildRangeBreakdown(
  rows: QuotaDataItem[],
  now: Date,
  rangeDays: PersonalRangeDays,
  topCount = PERSONAL_TOP_MODEL_COUNT
): PersonalRangeBreakdown {
  const days = groupByDay(rows, personalRangeStart(now, rangeDays), rangeDays)
  const totals = emptyTotals()
  for (const day of days) {
    totals.quota += day.quota
    totals.count += day.count
    totals.tokens += day.tokens
  }
  const byModel = sumByModel(days)
  const rankingDays =
    rangeDays === 30 ? days : groupByDay(rows, personalRangeStart(now, 30), 30)
  const topNames = [...sumByModel(rankingDays).entries()]
    .sort((a, b) => b[1].quota - a[1].quota || b[1].count - a[1].count)
    .slice(0, topCount)
    .map(([name]) => name)

  const models: PersonalModelShare[] = topNames.map((name, index) => ({
    field: `m${index}`,
    name,
    ...(byModel.get(name) ?? emptyTotals()),
  }))
  const other: PersonalModelShare = { field: 'other', name: null, ...emptyTotals() }
  let hasOther = false
  for (const [name, value] of byModel) {
    if (topNames.includes(name)) continue
    hasOther = true
    other.quota += value.quota
    other.count += value.count
    other.tokens += value.tokens
  }
  if (hasOther) models.push(other)
  return { days, models, totals }
}

/** 趋势图数据行：每天一行，每个模型（含其他）一个字段 */
export function buildTrendRows(
  breakdown: PersonalRangeBreakdown,
  metric: PersonalMetric
): Array<{ day: string } & Record<string, number | string>> {
  const topNames = new Set(
    breakdown.models.flatMap((model) => (model.name === null ? [] : [model.name]))
  )
  return breakdown.days.map((day) => {
    const row: { day: string } & Record<string, number | string> = {
      day: day.day,
    }
    let other = 0
    for (const model of breakdown.models) {
      if (model.name !== null) {
        row[model.field] = day.models.get(model.name)?.[metric] ?? 0
      }
    }
    for (const [name, value] of day.models) {
      if (!topNames.has(name)) other += value[metric]
    }
    if (breakdown.models.some((model) => model.name === null)) {
      row.other = other
    }
    return row
  })
}

/** 最近 7 天 × 24 小时的请求数，按本地时区落格 */
export function buildHourlyHeatmap(
  rows: QuotaDataItem[],
  now: Date
): PersonalHeatmapCell[] {
  const start = addDays(startOfDay(now), -(PERSONAL_HEATMAP_DAYS - 1))
  const cells = new Map<string, PersonalHeatmapCell>()
  const ordered: PersonalHeatmapCell[] = []
  for (let offset = 0; offset < PERSONAL_HEATMAP_DAYS; offset++) {
    const day = localDayKey(addDays(start, offset))
    for (let hour = 0; hour < 24; hour++) {
      const cell = { day, hour, count: 0 }
      cells.set(`${day}|${hour}`, cell)
      ordered.push(cell)
    }
  }
  for (const row of rows) {
    const date = new Date(row.created_at * 1000)
    const cell = cells.get(`${localDayKey(date)}|${date.getHours()}`)
    if (cell) cell.count += Number(row.count) || 0
  }
  return ordered
}

export type PersonalKeyRank = PersonalTotals & {
  tokenId: number
  name: string
}

/** 按密钥汇总 flow 数据并按消耗额度降序；name 为空（密钥已删除）时由调用方给出占位文案 */
export function buildKeyRanking(
  rows: FlowQuotaDataItem[],
  limit: number
): PersonalKeyRank[] {
  const byKey = new Map<number, PersonalKeyRank>()
  for (const row of rows) {
    const tokenId = Number(row.token_id) || 0
    let entry = byKey.get(tokenId)
    if (!entry) {
      entry = { tokenId, name: row.token_name ?? '', ...emptyTotals() }
      byKey.set(tokenId, entry)
    }
    if (!entry.name && row.token_name) entry.name = row.token_name
    entry.quota += Number(row.quota) || 0
    entry.count += Number(row.count) || 0
    entry.tokens += Number(row.token_used) || 0
  }
  return [...byKey.values()]
    .filter((entry) => entry.quota > 0 || entry.count > 0)
    .sort((a, b) => b.quota - a.quota || b.count - a.count)
    .slice(0, limit)
}
