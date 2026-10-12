import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatTimestampToDate } from '@/lib/format'

import type { DayRange } from '../../lib/date-presets'
import type { FinanceUserConsumption } from '../../types'
import {
  BalanceCell,
  ConsumptionCell,
  GroupCell,
  UserCell,
} from './user-consumption-cells'

const NUMERIC = 'text-right tabular-nums'

export function useUserConsumptionColumns(
  range: DayRange
): ColumnDef<FinanceUserConsumption, unknown>[] {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  return useMemo(
    () => [
      {
        accessorKey: 'username',
        header: t('User'),
        meta: { mobileTitle: true },
        cell: ({ row }) => <UserCell row={row.original} range={range} />,
        size: 220,
      },
      {
        accessorKey: 'group',
        header: t('Group'),
        cell: ({ row }) => <GroupCell row={row.original} />,
        size: 160,
      },
      {
        accessorKey: 'remain_quota',
        header: () => <div className={NUMERIC}>{t('Balance')}</div>,
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <BalanceCell row={row.original} />
          </div>
        ),
        size: 200,
      },
      {
        accessorKey: 'net_quota',
        header: () => (
          <div className={NUMERIC}>{t('Consumption in range')}</div>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <ConsumptionCell row={row.original} locale={locale} />
          </div>
        ),
        size: 180,
      },
      {
        accessorKey: 'consume_count',
        header: () => <div className={NUMERIC}>{t('Requests')}</div>,
        cell: ({ row }) => (
          <div className={NUMERIC}>
            {formatCompactNumber(row.original.consume_count, locale)}
          </div>
        ),
        size: 100,
      },
      {
        accessorKey: 'last_consume_at',
        header: t('Last consumed at'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatTimestampToDate(row.original.last_consume_at)}
          </span>
        ),
        size: 170,
      },
    ],
    [t, locale, range]
  )
}
