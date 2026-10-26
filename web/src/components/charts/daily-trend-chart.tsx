import { VChart } from '@visactor/react-vchart'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import { useChartTheme } from '@/lib/use-chart-theme'
import { cn } from '@/lib/utils'
import { VCHART_OPTION } from '@/lib/vchart'

export type DailyTrendSeries = {
  /** data 行里的数值字段名 */
  field: string
  /** 已翻译的图例 / 提示名 */
  label: string
}

export type DailyTrendRow = { day: string } & Record<string, number | string>

type DailyTrendChartProps = {
  /** 图表数据 id，同页多图时区分 */
  id: string
  /** 按日期升序，day 为 YYYY-MM-DD */
  data: DailyTrendRow[]
  series: DailyTrendSeries[]
  /** currency：数值是 quota 单位，按显示货币格式化；number：普通计数 */
  valueFormat: 'currency' | 'number'
  /** 多系列时是否堆叠（如输入 / 输出 Token） */
  stacked?: boolean
  loading?: boolean
  /** 全部为 0 时的占位文案 */
  emptyText?: string
  /** 外层容器样式（高度默认 h-60 sm:h-72） */
  className?: string
}

/** 系列颜色依次取品牌预设的图表色；chart-2 / chart-3 是中性色，跳过 */
const SERIES_COLOR_VARS = ['--chart-1', '--chart-4', '--chart-5']
const FALLBACK_COLORS = ['#1db954', '#2363c4', '#a35f00']

function readSeriesColors(count: number): string[] {
  const style =
    typeof document === 'undefined'
      ? null
      : getComputedStyle(document.documentElement)
  return Array.from({ length: count }, (_, index) => {
    const slot = index % SERIES_COLOR_VARS.length
    const value = style?.getPropertyValue(SERIES_COLOR_VARS[slot]).trim()
    return value || FALLBACK_COLORS[slot]
  })
}

/** 按天趋势面积图：平滑曲线 + 渐变填充，多系列可堆叠；跟随应用主题与品牌色，全部为 0 时显示占位 */
export function DailyTrendChart(props: DailyTrendChartProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
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
    const hasValue = props.data.some((row) =>
      props.series.some((serie) => Number(row[serie.field]) !== 0)
    )
    if (!hasValue) return null
    const formatValue = (value: number) =>
      props.valueFormat === 'currency'
        ? formatQuotaWithCurrency(value)
        : formatNumber(value, locale)
    const colors = readSeriesColors(props.series.length)
    const colorByLabel = new Map(
      props.series.map((serie, index) => [serie.label, colors[index]])
    )
    const values = props.data.flatMap((row) =>
      props.series.map((serie) => ({
        day: row.day,
        series: serie.label,
        value: Number(row[serie.field]) || 0,
      }))
    )
    const multiSeries = props.series.length > 1
    return {
      type: 'area' as const,
      data: [{ id: props.id, values }],
      xField: 'day',
      yField: 'value',
      seriesField: 'series',
      stack: Boolean(props.stacked),
      color: colors,
      line: {
        style: { curveType: 'monotone', lineWidth: 2 },
      },
      point: {
        visible: props.data.length <= 10,
        style: {
          size: 6,
          lineWidth: 2,
          fill: resolvedTheme === 'dark' ? '#121212' : '#ffffff',
        },
      },
      area: {
        style: {
          curveType: 'monotone',
          fill: (datum: Record<string, unknown>) => {
            const color = colorByLabel.get(String(datum?.series)) ?? colors[0]
            return {
              gradient: 'linear',
              x0: 0,
              y0: 0,
              x1: 0,
              y1: 1,
              stops: [
                { offset: 0, color, opacity: multiSeries ? 0.22 : 0.32 },
                { offset: 1, color, opacity: 0 },
              ],
            }
          },
        },
      },
      legends: {
        visible: multiSeries,
        orient: 'bottom',
        item: { label: { style: { fill: chartTextColor } } },
      },
      axes: [
        {
          orient: 'bottom',
          label: {
            formatMethod: (val: number | string) => String(val).slice(5),
            style: { fill: chartTextColor, fontSize: 10 },
            autoHide: true,
            autoLimit: true,
          },
          tick: { visible: false },
          domainLine: { visible: false },
        },
        {
          orient: 'left',
          label: {
            formatMethod: (val: number | string) =>
              props.valueFormat === 'currency'
                ? formatQuotaWithCurrency(Number(val), {
                    digitsLarge: 0,
                    digitsSmall: 2,
                  })
                : formatCompactNumber(Number(val), locale),
            style: { fill: chartTextColor, fontSize: 10 },
          },
          grid: {
            visible: true,
            style: { lineDash: [3, 3], stroke: chartGridColor },
          },
        },
      ],
      crosshair: {
        xField: {
          visible: true,
          line: {
            type: 'line',
            style: { stroke: chartGridColor, lineWidth: 1 },
          },
        },
      },
      tooltip: {
        dimension: {
          title: {
            value: (datum: Record<string, unknown>) => String(datum?.day ?? ''),
          },
          content: [
            {
              key: (datum: Record<string, unknown>) =>
                String(datum?.series ?? ''),
              value: (datum: Record<string, unknown>) =>
                formatValue(Number(datum?.value) || 0),
            },
          ],
        },
        mark: { visible: false },
      },
      animationAppear: { duration: 400 },
    }
  }, [
    chartGridColor,
    chartTextColor,
    locale,
    props.data,
    props.id,
    props.series,
    props.stacked,
    props.valueFormat,
    resolvedTheme,
  ])

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
