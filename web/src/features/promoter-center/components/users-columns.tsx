import type { ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'
import {
  formatCompactNumber,
  formatQuota,
  formatTimestampToDate,
} from '@/lib/format'
import { cn } from '@/lib/utils'

import { describeUsageScope } from '../lib/format'
import type { PromoterCenterUser } from '../types'

const NUMERIC = 'text-right tabular-nums'
const EMPTY_CELL = '—'

export const PROMOTER_SOURCE_LABEL_KEYS: Record<
  PromoterCenterUser['source'],
  string
> = {
  register: 'Referral sign-up',
  admin: 'Admin binding',
}

type UsePromoterUsersColumnsOptions = {
  /** 管理员视图：多邮箱 / 分组 / 操作人 */
  showContact: boolean
  onInspect: (user: PromoterCenterUser) => void
}

/** 名下用户表列定义；推广人自助视图与管理员绑定列表共用 */
export function usePromoterUsersColumns(
  options: UsePromoterUsersColumnsOptions
): ColumnDef<PromoterCenterUser, unknown>[] {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { showContact, onInspect } = options
  return useMemo(() => {
    const columns: ColumnDef<PromoterCenterUser, unknown>[] = [
      {
        id: 'user',
        accessorKey: 'username',
        header: t('User'),
        enableSorting: false,
        meta: { mobileTitle: true },
        cell: ({ row }) => {
          const user = row.original
          return (
            <div className='flex min-w-0 flex-col gap-0.5'>
              <div className='flex min-w-0 items-center gap-1.5'>
                <span
                  className={cn(
                    'truncate font-medium',
                    user.deleted && 'text-muted-foreground line-through'
                  )}
                >
                  {user.username || `#${user.user_id}`}
                </span>
                <span className='text-muted-foreground font-mono text-xs'>
                  #{user.user_id}
                </span>
                {user.is_enterprise && (
                  <StatusBadge
                    label={t('Enterprise')}
                    variant='info'
                    size='sm'
                    copyable={false}
                  />
                )}
                {user.deleted && (
                  <StatusBadge
                    label={t('Deleted')}
                    variant='neutral'
                    size='sm'
                    copyable={false}
                  />
                )}
              </div>
              {(user.display_name || (showContact && user.email)) && (
                <span className='text-muted-foreground truncate text-xs'>
                  {[user.display_name, showContact ? user.email : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
          )
        },
        size: 240,
      },
      {
        id: 'net_quota',
        accessorKey: 'net_quota',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Consumption')}
            className='justify-end'
          />
        ),
        meta: { label: t('Consumption'), mobileOrder: 10 },
        cell: ({ row }) => (
          <div className={`${NUMERIC} font-mono`}>
            {formatQuota(row.original.net_quota)}
          </div>
        ),
        size: 130,
      },
      {
        id: 'request_count',
        accessorKey: 'request_count',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Requests')}
            className='justify-end'
          />
        ),
        meta: { label: t('Requests'), mobileOrder: 20 },
        cell: ({ row }) => (
          <div className={NUMERIC}>
            {formatCompactNumber(row.original.request_count, locale)}
          </div>
        ),
        size: 110,
      },
      {
        id: 'total_tokens',
        accessorKey: 'total_tokens',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Tokens')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className={NUMERIC}>
            {formatCompactNumber(row.original.total_tokens, locale)}
          </div>
        ),
        meta: { mobileHidden: true },
        size: 110,
      },
      {
        id: 'last_consume_day',
        accessorKey: 'last_consume_day',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Last consumed')} />
        ),
        cell: ({ row }) => row.original.last_consume_day || EMPTY_CELL,
        meta: { mobileHidden: true },
        size: 120,
      },
      {
        id: 'scope',
        accessorKey: 'bound_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Bound at')} />
        ),
        cell: ({ row }) => {
          const user = row.original
          return (
            <div className='flex min-w-0 flex-col gap-0.5 text-xs'>
              <span>{formatTimestampToDate(user.bound_at)}</span>
              <span className='text-muted-foreground truncate'>
                {t(PROMOTER_SOURCE_LABEL_KEYS[user.source])} ·{' '}
                {describeUsageScope(user, t)}
                {showContact && user.bound_by_username
                  ? ` · ${user.bound_by_username}`
                  : ''}
              </span>
            </div>
          )
        },
        meta: { mobileHidden: true },
        size: 200,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => onInspect(row.original)}
                  aria-label={t('View details')}
                />
              }
            >
              <Eye />
            </TooltipTrigger>
            <TooltipContent>{t('View details')}</TooltipContent>
          </Tooltip>
        ),
        size: 56,
      },
    ]
    return columns
  }, [locale, onInspect, showContact, t])
}
