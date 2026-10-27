import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { categoricalSeriesColor } from '@/components/charts/categorical-palette'
import type { DailyTrendSeries } from '@/components/charts/daily-trend-chart'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type UsageMetric,
  UsageMetricTabs,
} from '@/features/enterprise-console/components/usage-trend'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import { useChartTheme } from '@/lib/use-chart-theme'

import {
  buildTrendRows,
  type PersonalMetric,
  type PersonalRangeBreakdown,
} from '../../lib/personal-overview'

const DailyTrendChart = lazy(() =>
  import('@/components/charts/daily-trend-chart').then((m) => ({
    default: m.DailyTrendChart,
  }))
)

const METRIC_FIELD: Record<UsageMetric, PersonalMetric> = {
  quota: 'quota',
  tokens: 'tokens',
  requests: 'count',
}

type UsageTrendCardProps = {
  breakdown: PersonalRangeBreakdown
  loading: boolean
}

/** 按天堆叠趋势：Top 模型 + 其他，颜色跟随模型（与占比环图一致），脚注为峰值 / 日均 / 合计 */
export function UsageTrendCard(props: UsageTrendCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { resolvedTheme } = useChartTheme()
  const dark = resolvedTheme === 'dark'
  const [metric, setMetric] = useState<UsageMetric>('quota')
  const field = METRIC_FIELD[metric]

  // 颜色按模型在列表中的固定位次分配，再隐藏本区间没有用量的模型，切换区间时颜色不漂移
  const series = useMemo<DailyTrendSeries[]>(
    () =>
      props.breakdown.models.flatMap((model, index) => {
        if (model.quota <= 0 && model.count <= 0) return []
        return [
          {
            field: model.field,
            label: model.name ?? t('Others'),
            color: categoricalSeriesColor(index, model.name === null, dark),
          },
        ]
      }),
    [dark, props.breakdown.models, t]
  )
  const rows = useMemo(
    () => buildTrendRows(props.breakdown, field),
    [field, props.breakdown]
  )

  const dailyTotals = props.breakdown.days.map((day) => day[field])
  const total = props.breakdown.totals[field]
  const peak = dailyTotals.length > 0 ? Math.max(...dailyTotals) : 0
  const average = dailyTotals.length > 0 ? total / dailyTotals.length : 0
  const format = (value: number) => {
    if (metric === 'quota') return formatQuotaWithCurrency(value)
    if (metric === 'tokens') return formatCompactNumber(value, locale)
    return formatNumber(Math.round(value), locale)
  }

  return (
    <Card className='h-full min-w-0'>
      <CardHeader>
        <CardTitle>{t('Usage trend')}</CardTitle>
        <CardDescription>{t('Daily usage stacked by model')}</CardDescription>
        <CardAction>
          <UsageMetricTabs value={metric} onChange={setMetric} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className='h-60 sm:h-72' />}>
          <DailyTrendChart
            id={`personal-trend-${metric}`}
            data={rows}
            series={series}
            valueFormat={metric === 'quota' ? 'currency' : 'number'}
            stacked
            loading={props.loading}
          />
        </Suspense>
        <div className='text-muted-foreground mt-2 flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs tabular-nums'>
          <span>
            {t('Peak')} {format(peak)}
          </span>
          <span>
            {t('Daily average')} {format(average)}
          </span>
          <span>
            {t('Total')} {format(total)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
