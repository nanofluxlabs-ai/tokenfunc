import { VChart } from '@visactor/react-vchart'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { formatQuota, quotaUnitsToDollars } from '@/lib/format'
import { useChartTheme } from '@/lib/use-chart-theme'
import { cn } from '@/lib/utils'
import { VCHART_OPTION } from '@/lib/vchart'

export type DailyQuotaPoint = {
  /** YYYY-MM-DD，按升序传入 */
  day: string
  /** 消耗（quota 单位），图上换算成显示货币 */
  quota: number
}

type DailyQuotaBarChartProps = {
  /** 图表数据 id，同页多图时区分 */
  id: string
  data: DailyQuotaPoint[]
  loading?: boolean
  /** 没有任何消耗时的占位文案 */
  emptyText?: string
  /** 外层容器样式（高度默认 h-60 sm:h-72） */
  className?: string
}

/** 按天消耗柱图：跟随应用主题，jsdom 下由调用方 mock 掉 VChart；全部为 0 的区间显示占位而不是空轴 */
export function DailyQuotaBarChart(props: DailyQuotaBarChartProps) {
  const { t } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const chartTextColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.68)'
      : 'rgba(15, 23, 42, 0.58)'
  const chartGridColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(15, 23, 42, 0.12)'

  const spec = useMemo(() => {
    if (!props.data.some((row) => row.quota !== 0)) return null
    const values = props.data.map((row) => ({
      day: row.day,
      usd: quotaUnitsToDollars(row.quota),
      quota: row.quota,
    }))
    return {
      type: 'bar' as const,
      data: [{ id: props.id, values }],
      xField: 'day',
      yField: 'usd',
      legends: { visible: false },
      axes: [
        {
          orient: 'bottom',
          label: {
            style: { fill: chartTextColor, fontSize: 10 },
            autoHide: true,
            autoLimit: true,
          },
          tick: { visible: false },
        },
        {
          orient: 'left',
          label: {
            formatMethod: (val: number | string) => `$${Number(val)}`,
            style: { fill: chartTextColor, fontSize: 10 },
          },
          grid: {
            visible: true,
            style: { lineDash: [3, 3], stroke: chartGridColor },
          },
        },
      ],
      tooltip: {
        mark: {
          title: {
            value: (datum: Record<string, unknown>) => String(datum?.day ?? ''),
          },
          content: [
            {
              key: () => t('Consumption'),
              value: (datum: Record<string, unknown>) =>
                formatQuota(Number(datum?.quota) || 0),
            },
          ],
        },
        dimension: { visible: false },
      },
      animationAppear: { duration: 400 },
    }
  }, [chartGridColor, chartTextColor, props.data, props.id, t])

  let placeholder = props.emptyText ?? t('No consumption in this range')
  if (props.loading) {
    placeholder = t('Loading...')
  }

  return (
    <div className={cn('h-60 sm:h-72', props.className)}>
      {themeReady && spec ? (
        <VChart
          key={`${props.id}-${resolvedTheme}`}
          spec={{
            ...spec,
            theme: resolvedTheme === 'dark' ? 'dark' : 'light',
            background: 'transparent',
          }}
          option={VCHART_OPTION}
        />
      ) : (
        <div className='text-muted-foreground/80 flex h-full items-center justify-center text-xs'>
          {placeholder}
        </div>
      )}
    </div>
  )
}
