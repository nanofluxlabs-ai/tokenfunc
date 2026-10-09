import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'

import { ENTERPRISE_BILLING_MODES } from '../constants'
import type { EnterpriseListItem } from '../types'
import { EnterpriseRowActions } from './enterprise-row-actions'

export function useEnterprisesColumns(): ColumnDef<EnterpriseListItem>[] {
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
      accessorKey: 'name',
      header: t('Enterprise'),
      meta: { mobileTitle: true },
      cell: ({ row }) => (
        <div className='flex min-w-0 flex-col'>
          <span className='truncate font-medium'>{row.original.name}</span>
          {row.original.contact_name && (
            <span className='text-muted-foreground truncate text-xs'>
              {row.original.contact_name}
            </span>
          )}
        </div>
      ),
      size: 220,
    },
    {
      accessorKey: 'username',
      header: t('Owner Account'),
      cell: ({ row }) => (
        <div className='flex min-w-0 flex-col'>
          <span className='truncate'>{row.original.username}</span>
          {row.original.email && (
            <span className='text-muted-foreground truncate text-xs'>
              {row.original.email}
            </span>
          )}
        </div>
      ),
      size: 200,
    },
    {
      accessorKey: 'billing_mode',
      header: t('Billing Mode'),
      meta: { mobileBadge: true },
      cell: ({ row }) => {
        const config = ENTERPRISE_BILLING_MODES[row.original.billing_mode]
        if (!config) return null
        const suspended = row.original.status === 'suspended'
        return (
          <StatusBadge
            label={
              suspended
                ? `${t(config.labelKey)} · ${t('Suspended')}`
                : t(config.labelKey)
            }
            variant={suspended ? 'danger' : config.variant}
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      size: 120,
    },
    {
      accessorKey: 'quota',
      header: t('Balance'),
      cell: ({ row }) => (
        <span className='font-mono text-sm'>
          {formatQuotaWithCurrency(row.original.quota)}
        </span>
      ),
      size: 140,
    },
    {
      accessorKey: 'used_quota',
      header: t('Used'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className='font-mono text-sm'>
          {formatQuotaWithCurrency(row.original.used_quota)}
        </span>
      ),
      size: 140,
    },
    {
      accessorKey: 'created_at',
      header: t('Created'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <div className='min-w-[160px] font-mono text-sm'>
          {formatTimestampToDate(row.original.created_at)}
        </div>
      ),
      size: 180,
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: ({ row }) => <EnterpriseRowActions enterprise={row.original} />,
      enableSorting: false,
      enableHiding: false,
      size: 80,
    },
  ]
}
