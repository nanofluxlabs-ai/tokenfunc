import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'

import { ENTERPRISE_BILLING_MODES } from '../constants'
import type { EnterpriseListItem } from '../types'
import { CreditLimitCell } from './credit-limit-cell'
import { EnterpriseRowActions } from './enterprise-row-actions'

const EMPTY_CELL = '—'

// 账期 end_at 是下一期起点（独占），展示时按含首尾的自然日显示，例如 2026-10-01 ~ 2026-10-31
function formatPeriodRange(startAt: number, endAt: number): string {
  if (startAt <= 0 || endAt <= 0) return EMPTY_CELL
  const start = dayjs(startAt * 1000).format('YYYY-MM-DD')
  const end = dayjs(endAt * 1000)
    .subtract(1, 'second')
    .format('YYYY-MM-DD')
  return `${start} ~ ${end}`
}

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
      size: 200,
    },
    {
      accessorKey: 'username',
      header: t('Owner Account'),
      cell: ({ row }) => (
        <span className='truncate'>{row.original.username}</span>
      ),
      size: 140,
    },
    {
      accessorKey: 'email',
      header: t('Email'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        // 主账号邮箱为空时退回企业联系邮箱
        const email = row.original.email || row.original.contact_email
        if (!email) return EMPTY_CELL
        return (
          <div className='flex min-w-0 items-center gap-1'>
            <span className='truncate'>{email}</span>
            <CopyButton
              value={email}
              size='icon'
              className='size-6'
              iconClassName='size-3.5'
              aria-label={`${t('Copy')} ${email}`}
            />
          </div>
        )
      },
      size: 220,
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
      // 授信企业不走钱包，余额列留空，额度看「授信额度」列
      cell: ({ row }) =>
        row.original.billing_mode === 'credit' ? (
          <span className='text-muted-foreground'>{EMPTY_CELL}</span>
        ) : (
          <span className='font-mono text-sm'>
            {formatQuotaWithCurrency(row.original.quota)}
          </span>
        ),
      size: 120,
    },
    {
      id: 'credit_limit',
      header: t('Credit Limit'),
      cell: ({ row }) =>
        row.original.billing_mode === 'credit' ? (
          <CreditLimitCell item={row.original} />
        ) : (
          <span className='text-muted-foreground'>{EMPTY_CELL}</span>
        ),
      enableSorting: false,
      size: 200,
    },
    {
      id: 'billing_cycle',
      header: t('Billing Cycle'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        if (row.original.billing_mode !== 'credit') {
          return <span className='text-muted-foreground'>{EMPTY_CELL}</span>
        }
        return (
          <span className='font-mono text-sm whitespace-nowrap'>
            {formatPeriodRange(
              row.original.period_start_at,
              row.original.period_end_at
            )}
          </span>
        )
      },
      enableSorting: false,
      size: 200,
    },
    {
      id: 'cycle_days',
      header: t('Cycle Days'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        if (row.original.billing_mode !== 'credit') {
          return <span className='text-muted-foreground'>{EMPTY_CELL}</span>
        }
        if (row.original.credit_cycle_type === 'fixed_days') {
          return `${row.original.credit_cycle_days} ${t('days')}`
        }
        return t('Calendar month')
      },
      enableSorting: false,
      size: 110,
    },
    {
      accessorKey: 'used_quota',
      header: t('Used'),
      meta: { mobileHidden: true },
      // 授信企业的本期已用已由「授信额度」列的剩余/总额度体现，这里留空
      cell: ({ row }) =>
        row.original.billing_mode === 'credit' ? (
          <span className='text-muted-foreground'>{EMPTY_CELL}</span>
        ) : (
          <span className='font-mono text-sm'>
            {formatQuotaWithCurrency(row.original.used_quota)}
          </span>
        ),
      size: 120,
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
