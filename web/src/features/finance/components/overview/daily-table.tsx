import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { formatQuota } from '@/lib/format'

import { formatMoney } from '../../lib/order-display'
import type { FinanceDailyStats, FinanceDisplayCurrency } from '../../types'

type DailyTableProps = {
  rows: FinanceDailyStats[]
  currency: FinanceDisplayCurrency
  isLoading?: boolean
  rangeLabel: string
}

const NUMERIC = 'text-right tabular-nums'

/** 每日经营明细：日期倒序，不分页 */
export function DailyTable(props: DailyTableProps) {
  const { t } = useTranslation()
  const rows = useMemo(
    () =>
      [...props.rows].sort((a, b) =>
        (a.date ?? '') < (b.date ?? '') ? 1 : -1
      ),
    [props.rows]
  )
  const money = (value: number) => formatMoney(value, props.currency)
  const columns: StaticDataTableColumn<FinanceDailyStats>[] = [
    { id: 'date', header: t('Date'), cell: (row) => row.date },
    {
      id: 'new_users',
      header: t('New registrations'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) => row.new_users,
    },
    {
      id: 'new_paid_users',
      header: t('New paying users'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) => row.new_paid_users,
    },
    {
      id: 'paid_order_count',
      header: t('Successful orders'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) => row.paid_order_count,
    },
    {
      id: 'paid_amount',
      header: t('Order amount'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) => money(row.paid_amount),
    },
    {
      id: 'wallet_amount',
      header: t('Top-up amount'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) => money(row.wallet_amount),
    },
    {
      id: 'subscription_amount',
      header: t('Subscription amount'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) => money(row.subscription_amount),
    },
    {
      id: 'all_user_consume_quota',
      header: t('All-user consumption'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) => formatQuota(row.all_user_consume_quota),
    },
    {
      id: 'paid_user_consume_quota',
      header: t('Paying-user consumption'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row) => formatQuota(row.paid_user_consume_quota),
    },
  ]
  return (
    <section className='flex flex-col gap-2'>
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>{t('Daily business details')}</h3>
        <span className='text-muted-foreground text-xs'>
          {props.rangeLabel}
        </span>
      </div>
      <StaticDataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.date ?? ''}
        empty={!props.isLoading && rows.length === 0}
        emptyContent={t('No data')}
      />
    </section>
  )
}
