import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import { ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS } from '../../constants'
import { formatOrderAmount } from '../../lib/order-display'
import type { FinanceOrder } from '../../types'

export function paymentMethodLabel(
  order: Pick<FinanceOrder, 'payment_method' | 'payment_provider'>,
  t: (key: string) => string
): string {
  const key = order.payment_method || order.payment_provider
  const config = PAYMENT_METHODS[key]
  return config ? t(config.labelKey) : key || '-'
}

export function useOrdersColumns(): ColumnDef<FinanceOrder, unknown>[] {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        accessorKey: 'create_time',
        header: t('Created at'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatTimestampToDate(row.original.create_time)}
          </span>
        ),
        size: 170,
      },
      {
        accessorKey: 'username',
        header: t('User'),
        meta: { mobileTitle: true },
        cell: ({ row }) => row.original.username || `#${row.original.user_id}`,
        size: 150,
      },
      {
        accessorKey: 'order_type',
        header: t('Order type'),
        cell: ({ row }) =>
          t(
            ORDER_TYPES[row.original.order_type]?.labelKey ??
              row.original.order_type
          ),
        size: 110,
      },
      {
        accessorKey: 'trade_no',
        header: t('Order No.'),
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col'>
            <span className='truncate font-mono'>{row.original.trade_no}</span>
            <span className='text-muted-foreground truncate font-mono text-xs'>
              {row.original.id}
            </span>
          </div>
        ),
        size: 280,
      },
      {
        accessorKey: 'usd_amount',
        header: t('Order amount'),
        cell: ({ row }) => (
          <span className='font-mono'>{formatOrderAmount(row.original)}</span>
        ),
        size: 180,
      },
      {
        accessorKey: 'credit_amount',
        header: t('Credited quota'),
        cell: ({ row }) =>
          row.original.credit_amount > 0
            ? formatQuota(row.original.credit_amount)
            : '-',
        size: 130,
      },
      {
        accessorKey: 'payment_method',
        header: t('Payment method'),
        cell: ({ row }) => paymentMethodLabel(row.original, t),
        size: 120,
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        meta: { mobileBadge: true },
        cell: ({ row }) => {
          const config = ORDER_STATUSES[row.original.status]
          return (
            <StatusBadge
              label={row.original.status}
              variant={config?.variant ?? 'neutral'}
              copyable={false}
            />
          )
        },
        size: 100,
      },
      {
        accessorKey: 'subject',
        header: t('Subject'),
        cell: ({ row }) => row.original.subject || '-',
        size: 160,
      },
    ],
    [t]
  )
}
