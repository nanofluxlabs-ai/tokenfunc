import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { UsageLogsUserLink } from '@/components/usage-logs-user-link'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import type { PromoterListItem } from '../types'
import { BoundUsersCell } from './bound-users-cell'
import { PromoterRowActions } from './promoter-row-actions'

const EMPTY_CELL = '—'

export function usePromotersColumns(): ColumnDef<PromoterListItem>[] {
  const { t } = useTranslation()
  return [
    {
      accessorKey: 'id',
      header: t('ID'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <TableId value={row.original.id} className='w-[60px]' />
      ),
      size: 80,
    },
    {
      accessorKey: 'username',
      header: t('Promoter'),
      meta: { mobileTitle: true },
      cell: ({ row }) => {
        const promoter = row.original
        return (
          <div className='flex min-w-0 flex-col'>
            <div className='flex min-w-0 items-center gap-1.5'>
              <UsageLogsUserLink
                username={promoter.username}
                className='truncate font-medium'
              />
              <span className='text-muted-foreground font-mono text-xs'>
                #{promoter.user_id}
              </span>
              {promoter.deleted && (
                <StatusBadge
                  label={t('Deleted')}
                  variant='neutral'
                  size='sm'
                  copyable={false}
                />
              )}
            </div>
            <span className='text-muted-foreground truncate text-xs'>
              {[promoter.display_name, promoter.email]
                .filter(Boolean)
                .join(' · ') || EMPTY_CELL}
            </span>
          </div>
        )
      },
      size: 240,
    },
    {
      accessorKey: 'remark',
      header: t('Remark'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className='text-muted-foreground line-clamp-2 text-xs'>
          {row.original.remark || EMPTY_CELL}
        </span>
      ),
      size: 200,
    },
    {
      accessorKey: 'bound_user_count',
      header: t('Bound users'),
      cell: ({ row }) => <BoundUsersCell promoter={row.original} />,
      size: 110,
    },
    {
      accessorKey: 'month_net_quota',
      header: () => <div className='text-right'>{t('Month consumption')}</div>,
      cell: ({ row }) => (
        <div className='text-right font-mono tabular-nums'>
          {formatQuota(row.original.month_net_quota)}
        </div>
      ),
      size: 130,
    },
    {
      accessorKey: 'created_at',
      header: t('Promoter since'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className='text-muted-foreground text-xs'>
          {formatTimestampToDate(row.original.created_at)}
        </span>
      ),
      size: 160,
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: ({ row }) => <PromoterRowActions promoter={row.original} />,
      size: 120,
    },
  ]
}
