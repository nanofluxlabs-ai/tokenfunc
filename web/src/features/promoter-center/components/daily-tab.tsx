import { VChart } from '@visactor/react-vchart'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { SectionBlock } from '@/features/finance/components/section-block'
import { toIntlLocale } from '@/i18n/languages'
import {
  formatCompactNumber,
  formatQuota,
  quotaUnitsToDollars,
} from '@/lib/format'
import { useChartTheme } from '@/lib/use-chart-theme'
import { VCHART_OPTION } from '@/lib/vchart'

import type { PromoterCenterDaily } from '../types'

type DailyTabProps = {
  daily: PromoterCenterDaily[]
  loading?: boolean
}

const NUMERIC = 'text-right tabular-nums'

/** 每日消耗：柱状图（净额）+ 按天明细表 */
export function DailyTab(props: DailyTabProps) {
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
    if (props.daily.length === 0) return null
    const values = props.daily.map((row) => ({
      day: row.day,
      usd: quotaUnitsToDollars(row.net_quota),
      quota: row.net_quota,
    }))
    return {
      type: 'bar' as const,
      data: [{ id: 'promoter-daily', values }],
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
  }, [chartGridColor, chartTextColor, props.daily, t])

  // 明细表最近的日期在前；图表时间轴保持升序
  const tableRows = useMemo(() => [...props.daily].reverse(), [props.daily])

  const columns = [
    {
      id: 'day',
      header: t('Date'),
      cell: (row: PromoterCenterDaily) => row.day,
    },
    {
      id: 'net_quota',
      header: t('Consumption'),
      className: NUMERIC,
      cellClassName: `${NUMERIC} font-mono`,
      cell: (row: PromoterCenterDaily) => formatQuota(row.net_quota),
    },
    {
      id: 'request_count',
      header: t('Requests'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row: PromoterCenterDaily) =>
        formatCompactNumber(row.request_count, locale),
    },
    {
      id: 'prompt_tokens',
      header: t('Input tokens'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row: PromoterCenterDaily) =>
        formatCompactNumber(row.prompt_tokens, locale),
    },
    {
      id: 'completion_tokens',
      header: t('Output tokens'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row: PromoterCenterDaily) =>
        formatCompactNumber(row.completion_tokens, locale),
    },
  ]

  return (
    <div className='flex flex-col gap-4'>
      <SectionBlock title={t('Daily consumption')}>
        <div className='h-60 px-4 py-3 sm:h-72'>
          {themeReady && spec ? (
            <VChart
              key={`promoter-daily-${resolvedTheme}`}
              spec={{
                ...spec,
                theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                background: 'transparent',
              }}
              option={VCHART_OPTION}
            />
          ) : (
            <div className='text-muted-foreground/80 flex h-full items-center justify-center text-xs'>
              {props.loading
                ? t('Loading...')
                : t('No consumption in this range')}
            </div>
          )}
        </div>
      </SectionBlock>
      <SectionBlock title={t('Summary by day')}>
        <StaticDataTable
          columns={columns}
          data={tableRows}
          getRowKey={(row) => row.day}
          empty={props.daily.length === 0}
          emptyContent={t('No consumption in this range')}
        />
      </SectionBlock>
    </div>
  )
}
