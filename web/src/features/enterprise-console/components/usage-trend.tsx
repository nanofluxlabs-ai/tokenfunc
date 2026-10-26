import { lazy, type ReactNode, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  DailyTrendRow,
  DailyTrendSeries,
} from '@/components/charts/daily-trend-chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import type { UsageDayItem } from '../types'

// 图表库按需加载：报表面板也嵌在管理员用户页的企业计费抽屉里，不能把 vchart 打进用户页
const DailyTrendChart = lazy(() =>
  import('@/components/charts/daily-trend-chart').then((m) => ({
    default: m.DailyTrendChart,
  }))
)

/** 趋势指标：消耗 / Token（输入、输出堆叠）/ 请求 */
export type UsageMetric = 'quota' | 'tokens' | 'requests'

const METRIC_OPTIONS: { value: UsageMetric; labelKey: string }[] = [
  { value: 'quota', labelKey: 'Cost' },
  { value: 'tokens', labelKey: 'Tokens' },
  { value: 'requests', labelKey: 'Requests' },
]

/** 指标切换页签，放在卡片头部右侧 */
export function UsageMetricTabs(props: {
  value: UsageMetric
  onChange: (metric: UsageMetric) => void
}) {
  const { t } = useTranslation()
  return (
    <Tabs
      value={props.value}
      onValueChange={(value) => props.onChange(value as UsageMetric)}
    >
      <TabsList aria-label={t('Trend metric')}>
        {METRIC_OPTIONS.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {t(option.labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

type UsageTrendProps = {
  id: string
  days: UsageDayItem[]
  metric: UsageMetric
  loading?: boolean
  className?: string
  /** 脚注左侧（如下钻链接），右侧固定是峰值 / 日均 */
  footer?: ReactNode
}

/** 按日趋势图 + 峰值 / 日均脚注（概览近 7 天与报表按日区块共用） */
export function UsageTrend(props: UsageTrendProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const series = useMemo<DailyTrendSeries[]>(() => {
    if (props.metric === 'tokens') {
      return [
        { field: 'prompt_tokens', label: t('Prompt Tokens') },
        { field: 'completion_tokens', label: t('Completion Tokens') },
      ]
    }
    if (props.metric === 'requests') {
      return [{ field: 'request_count', label: t('Requests') }]
    }
    return [{ field: 'quota', label: t('Cost') }]
  }, [props.metric, t])

  const rows = useMemo<DailyTrendRow[]>(
    () => props.days.map((day) => ({ ...day })),
    [props.days]
  )

  const values = props.days.map((day) => {
    if (props.metric === 'tokens') {
      return day.prompt_tokens + day.completion_tokens
    }
    if (props.metric === 'requests') return day.request_count
    return day.quota
  })
  const peak = values.length > 0 ? Math.max(...values) : 0
  const average =
    values.length > 0
      ? values.reduce((total, value) => total + value, 0) / values.length
      : 0
  const format = (value: number) => {
    if (props.metric === 'quota') return formatQuotaWithCurrency(value)
    if (props.metric === 'tokens') return formatCompactNumber(value, locale)
    return formatNumber(Math.round(value), locale)
  }

  return (
    <div className={props.className}>
      <Suspense fallback={<Skeleton className='h-60 sm:h-72' />}>
        <DailyTrendChart
          id={`${props.id}-${props.metric}`}
          data={rows}
          series={series}
          valueFormat={props.metric === 'quota' ? 'currency' : 'number'}
          stacked={props.metric === 'tokens'}
          loading={props.loading}
        />
      </Suspense>
      <div className='text-muted-foreground mt-2 flex items-center gap-3 text-xs tabular-nums'>
        <span className='flex-1'>{props.footer}</span>
        <span>
          {t('Peak')} {format(peak)}
        </span>
        <span>
          {t('Daily average')} {format(average)}
        </span>
      </div>
    </div>
  )
}
