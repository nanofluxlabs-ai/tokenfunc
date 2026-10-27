import type { ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, quotaUnitsToDollars } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ModelTreeNode } from '../../lib/model-consumption-tree'
import { ShareBar } from '../share-bar'

const NUMERIC = 'text-right tabular-nums'
const INDENT_CLASS = ['pl-0', 'pl-6', 'pl-12']

/** 金额强制按美元展示（倍率后的实际计费额），保留 4 位 */
export function formatModelCost(quota: number): string {
  return `$${quotaUnitsToDollars(quota).toFixed(4)}`
}

export function useModelConsumptionColumns(): ColumnDef<
  ModelTreeNode,
  unknown
>[] {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  return useMemo(
    () => [
      {
        id: 'name',
        accessorKey: 'label',
        header: `${t('Group')} / ${t('Model')} / ${t('Channel')}`,
        enableSorting: false,
        meta: { mobileTitle: true },
        cell: ({ row }) => {
          const node = row.original
          let hint: string | null = null
          if (node.level === 'group') {
            hint = t('{{count}} models', { count: node.childCount })
          } else if (node.level === 'model') {
            hint =
              node.inlineChannel ??
              t('{{count}} channels', { count: node.childCount })
          }
          return (
            <div
              className={cn(
                'flex items-center gap-1',
                INDENT_CLASS[row.depth] ?? 'pl-12'
              )}
            >
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
              <span
                className={cn(
                  'truncate',
                  node.level === 'group' && 'font-semibold'
                )}
              >
                {node.label}
              </span>
              {hint && (
                <span className='text-muted-foreground text-xs'>{hint}</span>
              )}
            </div>
          )
        },
        size: 360,
      },
      {
        id: 'cost',
        accessorKey: 'netQuota',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Cost (USD)')}
            className='justify-end'
          />
        ),
        meta: { label: t('Cost (USD)') },
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <ShareBar
              value={formatModelCost(row.original.netQuota)}
              percentage={row.original.share}
              tone={row.original.level === 'channel' ? 'muted' : 'primary'}
            />
          </div>
        ),
        size: 240,
      },
      {
        id: 'requests',
        accessorKey: 'consumeCount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Requests')}
            className='justify-end'
          />
        ),
        meta: { label: t('Requests') },
        cell: ({ row }) => (
          <div className={NUMERIC}>
            {formatCompactNumber(row.original.consumeCount, locale)}
          </div>
        ),
        size: 120,
      },
      {
        id: 'tokens',
        accessorKey: 'totalTokens',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Tokens')}
            className='justify-end'
          />
        ),
        meta: { label: t('Tokens') },
        cell: ({ row }) => (
          <div className={NUMERIC}>
            {formatCompactNumber(row.original.totalTokens, locale)}
          </div>
        ),
        size: 120,
      },
    ],
    [t, locale]
  )
}
