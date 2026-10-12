import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { ShareBar } from '@/features/finance/components/share-bar'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { TOPUP_SOURCES, TOPUP_TYPES } from '../constants'
import { formatSignedUsd, paymentMethodLabel } from '../lib/topup-display'
import type { TopupSourceRow } from '../types'

const NUMERIC = 'text-right tabular-nums'

type TopupSourceTableProps = {
  rows: TopupSourceRow[]
  isLoading?: boolean
}

/** 按 (类型, 来源, 支付方式) 汇总；负数行（扣减）不画占比条，只显示百分比 */
export function TopupSourceTable(props: TopupSourceTableProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const columns: StaticDataTableColumn<TopupSourceRow>[] = [
    {
      id: 'type',
      header: t('Type'),
      cell: (row) => t(TOPUP_TYPES[row.type].labelKey),
    },
    {
      id: 'source',
      header: t('Source'),
      cell: (row) => t(TOPUP_SOURCES[row.source].labelKey),
    },
    {
      id: 'payment_method',
      header: t('Payment method'),
      cell: (row) => paymentMethodLabel(row.payment_method, t),
    },
    {
      id: 'count',
      header: t('Entries'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) => formatNumber(row.count, locale),
    },
    {
      id: 'amount',
      header: t('Amount (USD)'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) =>
        row.quota < 0 ? (
          <span className='text-destructive'>
            {formatSignedUsd(row.amount_usd)}
          </span>
        ) : (
          formatSignedUsd(row.amount_usd)
        ),
    },
    {
      id: 'share',
      header: t('Share'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) =>
        row.percentage < 0 ? (
          <span className='text-muted-foreground text-xs'>
            {row.percentage.toFixed(2)}%
          </span>
        ) : (
          <ShareBar value='' percentage={row.percentage} className='ml-auto' />
        ),
    },
  ]
  return (
    <StaticDataTable
      columns={columns}
      data={props.rows}
      getRowKey={(row) => `${row.source}|${row.payment_method}`}
      empty={!props.isLoading && props.rows.length === 0}
      emptyContent={t('No wallet entries in this period')}
    />
  )
}
