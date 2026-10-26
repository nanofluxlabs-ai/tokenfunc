import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DailyQuotaBarChart } from '@/components/charts/daily-quota-bar-chart'
import { StaticDataTable } from '@/components/data-table'
import { SectionBlock } from '@/features/finance/components/section-block'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatQuota } from '@/lib/format'

import type { PromoterCenterDaily } from '../types'

type DailyTabProps = {
  daily: PromoterCenterDaily[]
  loading?: boolean
}

const NUMERIC = 'text-right tabular-nums'
// 手机上隐藏的次要数字列
const NUMERIC_DESKTOP = `${NUMERIC} hidden sm:table-cell`

/** 每日消耗：柱状图（净额）+ 按天明细表 */
export function DailyTab(props: DailyTabProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const chartData = useMemo(
    () => props.daily.map((row) => ({ day: row.day, quota: row.net_quota })),
    [props.daily]
  )

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
      className: NUMERIC_DESKTOP,
      cellClassName: NUMERIC_DESKTOP,
      cell: (row: PromoterCenterDaily) =>
        formatCompactNumber(row.prompt_tokens, locale),
    },
    {
      id: 'completion_tokens',
      header: t('Output tokens'),
      className: NUMERIC_DESKTOP,
      cellClassName: NUMERIC_DESKTOP,
      cell: (row: PromoterCenterDaily) =>
        formatCompactNumber(row.completion_tokens, locale),
    },
  ]

  return (
    <div className='flex flex-col gap-4'>
      <SectionBlock title={t('Daily consumption')}>
        <DailyQuotaBarChart
          id='promoter-daily'
          data={chartData}
          loading={props.loading}
          emptyText={t('No consumption in this range')}
          className='px-4 py-3'
        />
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
