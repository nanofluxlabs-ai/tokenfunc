import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { UsageDailyRow } from '../../types'
import { ShareBar } from '../share-bar'

const NUM = 'text-right tabular-nums'
// 手机上隐藏的次要数字列
const NUM_DESKTOP = `${NUM} hidden sm:table-cell`

export function DailySummaryTable(props: {
  rows: UsageDailyRow[]
  isLoading?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const number = (value: number) => formatNumber(value, locale)
  const columns: StaticDataTableColumn<UsageDailyRow>[] = [
    {
      id: 'day',
      header: t('Date'),
      cell: (row) => <span className='font-medium'>{row.day}</span>,
    },
    {
      id: 'calls',
      header: t('Requests'),
      className: NUM_DESKTOP,
      cellClassName: NUM_DESKTOP,
      cell: (row) => number(row.calls),
    },
    {
      id: 'input',
      header: t('Input tokens'),
      className: NUM_DESKTOP,
      cellClassName: NUM_DESKTOP,
      cell: (row) => number(row.input_tokens),
    },
    {
      id: 'cached',
      header: t('Cache hits'),
      className: NUM_DESKTOP,
      cellClassName: NUM_DESKTOP,
      cell: (row) => number(row.cached_tokens),
    },
    {
      id: 'cache_write',
      header: t('Cache writes'),
      className: NUM_DESKTOP,
      cellClassName: NUM_DESKTOP,
      cell: (row) => number(row.cache_creation_tokens),
    },
    {
      id: 'output',
      header: t('Output tokens'),
      className: NUM_DESKTOP,
      cellClassName: NUM_DESKTOP,
      cell: (row) => number(row.completion_tokens),
    },
    {
      id: 'amount',
      header: t('Amount (USD)'),
      className: NUM,
      cellClassName: `${NUM} font-mono`,
      cell: (row) => `$${Number.parseFloat(row.amount_usd).toFixed(6)}`,
    },
    {
      id: 'share',
      header: t('Share'),
      className: NUM,
      cell: (row) => (
        <div className='flex justify-end'>
          <ShareBar
            value=''
            percentage={row.percentage}
            className='min-w-[72px] sm:min-w-[140px]'
          />
        </div>
      ),
    },
  ]
  return (
    <StaticDataTable
      columns={columns}
      data={props.rows}
      getRowKey={(row) => row.day}
      empty={!props.isLoading && props.rows.length === 0}
      emptyContent={t('No usage')}
    />
  )
}
