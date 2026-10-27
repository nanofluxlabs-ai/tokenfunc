import { useQueries } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  Activity,
  CircleDollarSign,
  Database,
  Download,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DateRangePicker } from '@/components/date-range-picker'
import { MobileFilterSheet } from '@/components/mobile-filter-sheet'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/features/dashboard/components/ui/stat-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatDateStr, formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { downloadUsageCsv, type UsageQuery } from '../api'
import {
  fillUsageDays,
  matchUsagePreset,
  sharePercent,
  USAGE_RANGE_PRESETS,
  usageAttributionFor,
  type UsageDayRange,
  usageRangeFromPreset,
} from '../lib/usage-range'
import type { ApiResponse, UsageGroupBy, UsageSummary } from '../types'
import {
  type UsageAttributionGroup,
  UsageAttributionSection,
  UsageDailySection,
  UsageModelSection,
} from './usage-sections'

type UsagePanelProps = {
  /** react-query 缓存前缀，管理员与企业侧用不同的 key */
  queryKey: readonly unknown[]
  fetchSummary: (params: UsageQuery) => Promise<ApiResponse<UsageSummary>>
  exportUrl: string
  /** 固定筛选（团队角色只看本团队；管理员侧按需传） */
  filter?: Pick<UsageQuery, 'team_id' | 'member_id'>
  /** 深链维度：model / day 滚动到对应区块，team / member / token 选中归属页签 */
  initialGroupBy?: UsageGroupBy
  /** 初始区间（深链或快捷档）；缺省为本月 */
  initialRange?: UsageDayRange
  /** 团队角色只有一个团队，归属页签不显示「团队」，默认落到成员 */
  hideTeamDimension?: boolean
  /** 受控区间：报表页把区间写进地址栏，后退 / 刷新 / 分享看到同一视图；不传则面板自管 */
  range?: UsageDayRange
  onRangeChange?: (range: UsageDayRange) => void
  /** 受控归属页签，用法同 range */
  attribution?: UsageAttributionGroup
  onAttributionChange?: (group: UsageAttributionGroup) => void
}

const STAT_CARD_CLASS = 'bg-card rounded-xl border p-3 shadow-xs sm:p-4'

/**
 * 用量报表（企业控制台与管理员抽屉共用）：区间 + 快捷档 + 区间合计 + 按日 / 按模型 / 按归属三块；
 * 每块的图与表来自同一次查询，合计取自按日数据，切换归属页签不影响合计。容器查询让抽屉里自动单列。
 */
export function UsagePanel(props: UsagePanelProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [rangeState, setRangeState] = useState<UsageDayRange>(
    () => props.initialRange ?? usageRangeFromPreset('month')
  )
  const [attributionState, setAttributionState] =
    useState<UsageAttributionGroup>(() =>
      usageAttributionFor(props.initialGroupBy, props.hideTeamDimension)
    )
  const range = props.range ?? rangeState
  const attribution = props.attribution ?? attributionState
  const setRange = (next: UsageDayRange) => {
    setRangeState(next)
    props.onRangeChange?.(next)
  }
  const setAttribution = (next: UsageAttributionGroup) => {
    setAttributionState(next)
    props.onAttributionChange?.(next)
  }
  const [exporting, setExporting] = useState(false)
  const filter = props.filter ?? {}
  const invalidRange = range.from > range.to
  const activePreset = matchUsagePreset(range)
  const activePresetLabelKey = USAGE_RANGE_PRESETS.find(
    (preset) => preset.value === activePreset
  )?.labelKey
  const rangeLabel = activePresetLabelKey
    ? t(activePresetLabelKey)
    : `${range.from} ~ ${range.to}`

  // 三块各一个查询：按日（趋势 / 每日明细 / 合计）、按模型、按当前归属维度
  const [daySummary, modelSummary, attributionSummary] = useQueries({
    queries: (['day', 'model', attribution] as UsageGroupBy[]).map(
      (groupBy) => ({
        queryKey: [
          ...props.queryKey,
          'usage',
          groupBy,
          range.from,
          range.to,
          filter.team_id,
          filter.member_id,
        ],
        queryFn: async () =>
          requireServerSuccess(
            await props.fetchSummary({ ...filter, group_by: groupBy, ...range })
          ).data?.items ?? [],
        enabled: !invalidRange,
      })
    ),
  })

  const days = useMemo(
    () => (invalidRange ? [] : fillUsageDays(daySummary.data ?? [], range)),
    [daySummary.data, invalidRange, range]
  )
  const totals = useMemo(
    () =>
      days.reduce(
        (acc, day) => ({
          quota: acc.quota + day.quota,
          requests: acc.requests + day.request_count,
          prompt: acc.prompt + day.prompt_tokens,
          completion: acc.completion + day.completion_tokens,
          cache: acc.cache + day.cache_tokens,
        }),
        { quota: 0, requests: 0, prompt: 0, completion: 0, cache: 0 }
      ),
    [days]
  )
  const dayCount = Math.max(1, days.length)

  // 深链维度为 model / day 时滚动到对应区块（只在首次渲染时）
  const dailyRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  const initialGroupBy = useRef(props.initialGroupBy)
  useEffect(() => {
    let target: HTMLDivElement | null = null
    if (initialGroupBy.current === 'model') target = modelRef.current
    if (initialGroupBy.current === 'day') target = dailyRef.current
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await downloadUsageCsv(props.exportUrl, {
        ...filter,
        ...range,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `usage-${range.from}-${range.to}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      handleServerError(error)
    } finally {
      setExporting(false)
    }
  }

  const idPrefix = props.queryKey.join('-')
  const loading = daySummary.isLoading

  return (
    <div className='@container flex flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        {/* 手机上区间与快捷档收进一个按钮，按钮上显示当前快捷档或区间 */}
        <MobileFilterSheet label={rangeLabel}>
          <DateRangePicker
            value={{
              from: dayjs(range.from).toDate(),
              to: dayjs(range.to).toDate(),
            }}
            onChange={(next) =>
              next.from &&
              next.to &&
              setRange({
                from: formatDateStr(next.from),
                to: formatDateStr(next.to),
              })
            }
            className='w-full sm:w-auto sm:min-w-[240px]'
          />
          <div
            className='bg-muted flex flex-wrap gap-1 rounded-lg p-1'
            role='group'
            aria-label={t('Quick range')}
          >
            {USAGE_RANGE_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                size='sm'
                variant={activePreset === preset.value ? 'secondary' : 'ghost'}
                className='h-9 flex-1 sm:h-7 sm:flex-none'
                aria-pressed={activePreset === preset.value}
                onClick={() => setRange(usageRangeFromPreset(preset.value))}
              >
                {t(preset.labelKey)}
              </Button>
            ))}
          </div>
        </MobileFilterSheet>
        <div className='flex-1' />
        <Button
          variant='outline'
          size='sm'
          onClick={() => void handleExport()}
          disabled={exporting || invalidRange}
          aria-label={t('Export CSV')}
        >
          <Download className='h-4 w-4' />
          {/* 手机上只留图标，给区间按钮让出宽度 */}
          <span className='hidden sm:inline'>
            {exporting ? t('Exporting...') : t('Export CSV')}
          </span>
        </Button>
      </div>
      {invalidRange && (
        <p className='text-destructive text-sm'>
          {t('The start date must not be later than the end date.')}
        </p>
      )}

      <div
        className='grid grid-cols-2 gap-2 sm:gap-4 @5xl:grid-cols-4'
        role='group'
        aria-label={t('Range totals')}
      >
        <div className={STAT_CARD_CLASS}>
          <StatCard
            title={t('Cost in range')}
            value={formatQuotaWithCurrency(totals.quota)}
            description={t('Daily average {{value}}', {
              value: formatQuotaWithCurrency(totals.quota / dayCount),
            })}
            icon={CircleDollarSign}
            tone='accent-1'
            sparkline={days.map((day) => day.quota)}
            sparklineVariant='line'
            loading={loading}
            compactMobile
          />
        </div>
        <div className={STAT_CARD_CLASS}>
          <StatCard
            title={t('Requests')}
            value={formatNumber(totals.requests, locale)}
            description={t('Daily average {{value}}', {
              value: formatNumber(
                Math.round(totals.requests / dayCount),
                locale
              ),
            })}
            icon={Activity}
            tone='accent-2'
            sparkline={days.map((day) => day.request_count)}
            sparklineVariant='line'
            loading={loading}
            compactMobile
          />
        </div>
        <div className={STAT_CARD_CLASS}>
          <StatCard
            title={t('Tokens')}
            value={formatCompactNumber(
              totals.prompt + totals.completion,
              locale
            )}
            description={t('Input {{input}} · Output {{output}}', {
              input: formatCompactNumber(totals.prompt, locale),
              output: formatCompactNumber(totals.completion, locale),
            })}
            icon={Zap}
            tone='accent-3'
            sparkline={days.map(
              (day) => day.prompt_tokens + day.completion_tokens
            )}
            sparklineVariant='line'
            loading={loading}
            compactMobile
          />
        </div>
        <div className={STAT_CARD_CLASS}>
          <StatCard
            title={t('Cache hit rate')}
            value={`${sharePercent(totals.cache, totals.prompt)}%`}
            description={t('Cached: {{count}}', {
              count: formatCompactNumber(totals.cache, locale),
            })}
            icon={Database}
            tone='accent-1'
            sparkline={days.map((day) => day.cache_tokens)}
            sparklineVariant='bars'
            loading={loading}
            compactMobile
          />
        </div>
      </div>

      <UsageDailySection
        ref={dailyRef}
        idPrefix={idPrefix}
        days={days}
        loading={loading}
        totalQuota={totals.quota}
      />
      <UsageModelSection
        ref={modelRef}
        idPrefix={idPrefix}
        items={modelSummary.data ?? []}
        loading={modelSummary.isLoading}
        totalQuota={totals.quota}
      />
      <UsageAttributionSection
        idPrefix={idPrefix}
        items={attributionSummary.data ?? []}
        loading={attributionSummary.isLoading}
        totalQuota={totals.quota}
        group={attribution}
        onGroupChange={setAttribution}
        hideTeamDimension={props.hideTeamDimension}
      />
    </div>
  )
}
