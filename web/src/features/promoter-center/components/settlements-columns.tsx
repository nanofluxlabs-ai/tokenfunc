import type { ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatCurrencyUSD, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { SettlementTreeRow } from '../lib/settlement-tree'
import type { PromoterSettlementMonth } from '../types'
import { SettlementStatusCell } from './settlement-status-cell'

const NUMERIC = 'text-right tabular-nums'
const EMPTY_CELL = '—'

export type SettlementActions = {
  onMark: (month: PromoterSettlementMonth) => void
  onRevert: (month: PromoterSettlementMonth) => void
}

type UseSettlementsColumnsOptions = {
  /** 管理员视图：多流水号 / 操作人 / 核销数 */
  showOperator: boolean
  /** 有操作时多一列「标记已结算 / 撤销」 */
  actions?: SettlementActions
}

function formatSettlementAmount(amount: string | null | undefined): string {
  if (amount == null || amount === '') return EMPTY_CELL
  const value = Number.parseFloat(amount)
  return Number.isFinite(value) ? formatCurrencyUSD(value) : EMPTY_CELL
}

export function useSettlementsColumns(
  options: UseSettlementsColumnsOptions
): ColumnDef<SettlementTreeRow, unknown>[] {
  const { t } = useTranslation()
  const { showOperator, actions } = options
  return useMemo(() => {
    const columns: ColumnDef<SettlementTreeRow, unknown>[] = [
      {
        id: 'month',
        header: t('Settlement month'),
        enableSorting: false,
        meta: { mobileTitle: true },
        cell: ({ row }) => {
          const node = row.original
          if (node.kind === 'user') {
            const user = node.user
            return (
              <div className='flex min-w-0 items-center gap-1.5 pl-8'>
                <span
                  className={cn(
                    'truncate',
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
              </div>
            )
          }
          return (
            <div className='flex items-center gap-1'>
              {row.getCanExpand() ? (
                <Button
                  variant='ghost'
                  size='icon-xs'
                  aria-label={row.getIsExpanded() ? t('Collapse') : t('Expand')}
                  aria-expanded={row.getIsExpanded()}
                  onClick={row.getToggleExpandedHandler()}
                >
                  {row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
                </Button>
              ) : (
                <span className='inline-block size-6' aria-hidden='true' />
              )}
              <span className='font-mono font-semibold'>
                {node.month.month}
              </span>
              <span className='text-muted-foreground text-xs'>
                {t('{{count}} users', { count: node.month.users.length })}
              </span>
            </div>
          )
        },
        size: 240,
      },
      {
        id: 'net_quota',
        header: () => <div className={NUMERIC}>{t('Consumption')}</div>,
        meta: { label: t('Consumption'), mobileOrder: 10 },
        enableSorting: false,
        cell: ({ row }) => {
          const node = row.original
          const value =
            node.kind === 'user' ? node.user.net_quota : node.month.net_quota
          return (
            <div className={cn(NUMERIC, 'font-mono')}>{formatQuota(value)}</div>
          )
        },
        size: 130,
      },
      {
        id: 'credit',
        header: () => (
          <div className={NUMERIC}>
            {t('Credit paid')} / {t('Credit unpaid')}
          </div>
        ),
        enableSorting: false,
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const node = row.original
          if (node.kind === 'user') {
            if (!node.user.has_credit) {
              return (
                <div className={cn(NUMERIC, 'text-muted-foreground')}>
                  {EMPTY_CELL}
                </div>
              )
            }
            return (
              <div className={cn(NUMERIC, 'font-mono text-xs')}>
                {formatQuota(node.user.credit_paid_quota)} /{' '}
                {formatQuota(node.user.credit_unpaid_quota)}
              </div>
            )
          }
          const month = node.month
          return (
            <div className={cn(NUMERIC, 'flex flex-col font-mono text-xs')}>
              <span>
                {formatQuota(month.credit_paid_quota)} /{' '}
                {formatQuota(month.credit_unpaid_quota)}
              </span>
              {showOperator && (month.credit_void_quota ?? 0) !== 0 && (
                <span className='text-muted-foreground font-sans'>
                  {t('Includes {{amount}} from voided bills', {
                    amount: formatQuota(month.credit_void_quota ?? 0),
                  })}
                </span>
              )}
            </div>
          )
        },
        size: 200,
      },
      {
        id: 'status',
        header: t('Status'),
        meta: { mobileBadge: true },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.kind === 'month' ? (
            <SettlementStatusCell month={row.original.month} />
          ) : null,
        size: 120,
      },
      {
        id: 'amount',
        header: () => <div className={NUMERIC}>{t('Amount')}</div>,
        meta: { label: t('Amount'), mobileOrder: 20 },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.kind === 'month' ? (
            <div className={cn(NUMERIC, 'font-mono')}>
              {formatSettlementAmount(
                row.original.month.settlement?.amount_usd
              )}
            </div>
          ) : null,
        size: 110,
      },
      {
        id: 'remark',
        header: t('Remark'),
        enableSorting: false,
        meta: { mobileHidden: true },
        cell: ({ row }) =>
          row.original.kind === 'month' ? (
            <span className='text-muted-foreground line-clamp-2 text-xs'>
              {row.original.month.settlement?.remark || EMPTY_CELL}
            </span>
          ) : null,
        size: 160,
      },
    ]
    if (showOperator) {
      columns.push({
        id: 'operator',
        header: t('Reference'),
        enableSorting: false,
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          if (row.original.kind !== 'month') return null
          const settlement = row.original.month.settlement
          if (!settlement) {
            return <span className='text-muted-foreground'>{EMPTY_CELL}</span>
          }
          return (
            <div className='flex flex-col text-xs'>
              <span className='font-mono'>
                {settlement.reference || EMPTY_CELL}
              </span>
              <span className='text-muted-foreground'>
                {settlement.settled_by_username || EMPTY_CELL}
              </span>
            </div>
          )
        },
        size: 160,
      })
    }
    if (actions) {
      columns.push({
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.kind !== 'month') return null
          const month = row.original.month
          if (month.settled) {
            return (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      className='text-destructive hover:text-destructive'
                      aria-label={t('Revert settlement')}
                      onClick={() => actions.onRevert(month)}
                    />
                  }
                >
                  <RotateCcw />
                </TooltipTrigger>
                <TooltipContent>{t('Revert settlement')}</TooltipContent>
              </Tooltip>
            )
          }
          if (!month.settleable) return null
          return (
            <Button
              variant='outline'
              size='sm'
              onClick={() => actions.onMark(month)}
            >
              {t('Mark as settled')}
            </Button>
          )
        },
        size: 140,
      })
    }
    return columns
  }, [t, showOperator, actions])
}
