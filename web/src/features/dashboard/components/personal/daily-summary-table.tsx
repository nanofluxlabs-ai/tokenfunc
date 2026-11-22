import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { sharePercent } from '@/features/enterprise-console/lib/usage-range'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import type {
  PersonalDayRow,
  PersonalRangeBreakdown,
} from '../../lib/personal-overview'

type DailySummaryTableProps = {
  breakdown: PersonalRangeBreakdown
  loading: boolean
}

/** 当天消耗最多的模型；没有用量时为 null */
function topModelOf(day: PersonalDayRow): string | null {
  let top: string | null = null
  let topQuota = -1
  for (const [name, value] of day.models) {
    if (value.quota > topQuota) {
      top = name
      topQuota = value.quota
    }
  }
  return top
}

/** 每日消耗汇总：最新日期在上，占比条为当日消耗占区间合计的比例；同时是趋势图的表格视图 */
export function DailySummaryTable(props: DailySummaryTableProps) {
  const { t, i18n } = useTranslation()
  const reduceMotion = useReducedMotion()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const total = props.breakdown.totals.quota
  const rows = useMemo(
    () => [...props.breakdown.days].reverse(),
    [props.breakdown.days]
  )

  const columns: StaticDataTableColumn<PersonalDayRow>[] = [
    {
      id: 'day',
      header: t('Date'),
      cell: (row) => <span className='tabular-nums'>{row.day}</span>,
    },
    {
      id: 'model',
      header: t('Main model'),
      cellClassName: 'truncate',
      cell: (row) => (
        <span className='font-mono text-xs'>{topModelOf(row) ?? '-'}</span>
      ),
    },
    {
      id: 'count',
      header: t('Requests'),
      className: 'text-right',
      cellClassName: 'text-right tabular-nums',
      cell: (row) => formatNumber(row.count, locale),
    },
    {
      id: 'quota',
      header: t('Cost'),
      className: 'text-right',
      cellClassName: 'text-right font-medium tabular-nums',
      cell: (row) => formatQuotaWithCurrency(row.quota),
    },
    {
      id: 'tokens',
      header: t('Tokens'),
      className: 'text-right',
      cellClassName: 'text-right tabular-nums',
      cell: (row) => formatCompactNumber(row.tokens, locale),
    },
    {
      id: 'share',
      header: t('Share'),
      className: 'text-right',
      cell: (row) => {
        const percent = sharePercent(row.quota, total)
        return (
          <div className='flex items-center justify-end gap-2'>
            {/* 卡片底色接近 bg-muted，轨道用前景色叠加，0% 时也能看清 */}
            <div className='bg-foreground/10 h-1.5 w-24 overflow-hidden rounded-full'>
              <motion.div
                className='bg-chart-1 h-full rounded-full'
                initial={reduceMotion ? false : { width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
              />
            </div>
            <span className='text-muted-foreground w-11 text-right text-xs tabular-nums'>
              {percent}%
            </span>
          </div>
        )
      },
    },
  ]

  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>{t('Daily summary')}</CardTitle>
        <CardDescription>
          {t('Requests, spend and tokens per day in this range')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <Skeleton className='h-64' />
        ) : (
          <StaticDataTable
            columns={columns}
            // 文本列在左、数字列在右，等分列宽让各列间距一致
            tableClassName='min-w-[40rem] table-fixed'
            data={rows}
            getRowKey={(row) => row.day}
            getRowClassName={(row) =>
              row.count === 0 ? 'text-muted-foreground' : undefined
            }
          />
        )}
      </CardContent>
    </Card>
  )
}
