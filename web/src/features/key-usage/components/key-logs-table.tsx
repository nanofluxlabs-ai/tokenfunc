import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
} from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota, formatTimestampToDate } from '@/lib/format'

import type { KeyUsageLog } from '../types'

const NUMERIC = 'text-right tabular-nums'

type KeyLogsTableProps = {
  logs: KeyUsageLog[]
  total: number
  loading: boolean
  fetching: boolean
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
  ensurePageInRange: (pageCount: number) => void
  toolbar: React.ReactNode
}

/** 调用记录：服务端分页，筛选条件由页面放在 toolbar 里 */
export function KeyLogsTable(props: KeyLogsTableProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const columns = useMemo<ColumnDef<KeyUsageLog, unknown>[]>(
    () => [
      {
        id: 'time',
        header: t('Time'),
        meta: { mobileTitle: true },
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatTimestampToDate(row.original.created_at)}
          </span>
        ),
        size: 170,
      },
      {
        id: 'model',
        header: t('Model'),
        meta: { mobileOrder: 10 },
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.model_name}</span>
        ),
        size: 200,
      },
      {
        id: 'prompt_tokens',
        header: () => <div className={NUMERIC}>{t('Input tokens')}</div>,
        meta: { label: t('Input tokens'), mobileOrder: 20 },
        cell: ({ row }) => (
          <div className={NUMERIC}>
            {formatNumber(row.original.prompt_tokens, locale)}
          </div>
        ),
        size: 110,
      },
      {
        id: 'completion_tokens',
        header: () => <div className={NUMERIC}>{t('Output tokens')}</div>,
        meta: { label: t('Output tokens'), mobileOrder: 30 },
        cell: ({ row }) => (
          <div className={NUMERIC}>
            {formatNumber(row.original.completion_tokens, locale)}
          </div>
        ),
        size: 110,
      },
      {
        id: 'quota',
        header: () => <div className={NUMERIC}>{t('Cost')}</div>,
        meta: { label: t('Cost'), mobileBadge: true },
        cell: ({ row }) => (
          <div className={`${NUMERIC} font-medium`}>
            {formatQuota(row.original.quota)}
          </div>
        ),
        size: 110,
      },
      {
        id: 'use_time',
        header: () => <div className={NUMERIC}>{t('Duration')}</div>,
        meta: { label: t('Duration'), mobileOrder: 40 },
        cell: ({ row }) => (
          <div className={`${NUMERIC} text-muted-foreground`}>
            {row.original.use_time}s
            {row.original.is_stream && ` · ${t('Streaming')}`}
          </div>
        ),
        size: 110,
      },
    ],
    [t, locale]
  )

  const { table } = useDataTable({
    data: props.logs,
    columns,
    getRowId: (row) => String(row.id),
    pagination: props.pagination,
    onPaginationChange: props.onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    enableSorting: false,
    totalCount: props.total,
    ensurePageInRange: props.ensurePageInRange,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={props.loading}
      isFetching={props.fetching}
      emptyTitle={t('No records')}
      skeletonKeyPrefix='key-usage-logs-skeleton'
      fixedHeight={false}
      paginationInFooter={false}
      applyHeaderSize
      toolbar={props.toolbar}
    />
  )
}
