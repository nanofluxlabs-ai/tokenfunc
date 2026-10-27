import { lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { categoricalSeriesColor } from '@/components/charts/categorical-palette'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { sharePercent } from '@/features/enterprise-console/lib/usage-range'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { useChartTheme } from '@/lib/use-chart-theme'

import type { PersonalRangeBreakdown } from '../../lib/personal-overview'

const UsageDonutChart = lazy(() =>
  import('@/features/enterprise-console/components/usage-charts').then((m) => ({
    default: m.UsageDonutChart,
  }))
)

type ModelShareCardProps = {
  breakdown: PersonalRangeBreakdown
  loading: boolean
}

/** 区间内各模型消耗占比：环形图 + 带色点的明细（同时充当图例与数值标签） */
export function ModelShareCard(props: ModelShareCardProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useChartTheme()
  const dark = resolvedTheme === 'dark'
  const total = props.breakdown.totals.quota

  // 颜色按固定位次分配后再隐藏本区间无消耗的模型，与趋势图保持同色
  const items = useMemo(
    () =>
      props.breakdown.models
        .map((model, index) => ({
          key: model.field,
          name: model.name ?? t('Others'),
          quota: model.quota,
          color: categoricalSeriesColor(index, model.name === null, dark),
        }))
        .filter((item) => item.quota > 0),
    [dark, props.breakdown.models, t]
  )
  const slices = useMemo(
    () => items.map((item) => ({ name: item.name, quota: item.quota })),
    [items]
  )
  const colors = useMemo(() => items.map((item) => item.color), [items])

  return (
    <Card className='h-full min-w-0'>
      <CardHeader>
        <CardTitle>{t('Spend by model')}</CardTitle>
        <CardDescription>{t('Share of spend in this range')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {props.loading ? (
          <Skeleton className='h-56' />
        ) : (
          <Suspense fallback={<Skeleton className='h-56' />}>
            <UsageDonutChart
              id='personal-model-share'
              data={slices}
              colors={colors}
              className='h-56'
            />
          </Suspense>
        )}
        {total > 0 && (
          <ul className='flex flex-col gap-0.5 text-xs'>
            {items.map((item) => (
              <li
                key={item.key}
                className='hover:bg-muted/60 -mx-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors'
              >
                <span
                  className='size-2 shrink-0 rounded-full'
                  style={{ backgroundColor: item.color }}
                  aria-hidden='true'
                />
                <span className='min-w-0 flex-1 truncate font-mono'>
                  {item.name}
                </span>
                <span className='tabular-nums'>
                  {formatQuotaWithCurrency(item.quota)}
                </span>
                <span className='text-muted-foreground w-12 text-right tabular-nums'>
                  {sharePercent(item.quota, total)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
