import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTableColumnHeader,
  DataTablePage,
  useDataTable,
} from '@/components/data-table'
import { ShareBar } from '@/features/finance/components/share-bar'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatQuota } from '@/lib/format'

import { PROMOTER_CENTER_PAGE_SIZE } from '../constants'
import type { PromoterCenterModel } from '../types'

const NUMERIC = 'text-right tabular-nums'

type ModelsTabProps = {
  items: PromoterCenterModel[]
  loading?: boolean
  fetching?: boolean
}

/** 模型消费：按净额排序，占比以区间总净额为分母 */
export function ModelsTab(props: ModelsTabProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const columns = useMemo<ColumnDef<PromoterCenterModel, unknown>[]>(
    () => [
      {
        id: 'model_name',
        accessorKey: 'model_name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model')} />
        ),
        meta: { mobileTitle: true },
        cell: ({ row }) => (
          <span className='truncate font-medium'>
            {row.original.model_name}
          </span>
        ),
        size: 260,
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
          <div className='flex justify-end'>
            <ShareBar
              value={formatQuota(row.original.net_quota)}
              percentage={row.original.percentage}
            />
          </div>
        ),
        size: 220,
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
        id: 'prompt_tokens',
        accessorKey: 'prompt_tokens',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Input tokens')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className={NUMERIC}>
            {formatCompactNumber(row.original.prompt_tokens, locale)}
          </div>
        ),
        meta: { mobileHidden: true },
        size: 120,
      },
      {
        id: 'completion_tokens',
        accessorKey: 'completion_tokens',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Output tokens')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className={NUMERIC}>
            {formatCompactNumber(row.original.completion_tokens, locale)}
          </div>
        ),
        meta: { mobileHidden: true },
        size: 120,
      },
    ],
    [locale, t]
  )
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'net_quota', desc: true },
  ])
  const { table } = useDataTable({
    data: props.items,
    columns,
    getRowId: (row) => row.model_name,
    withSortedRowModel: true,
    withPaginationRowModel: true,
    sorting,
    onSortingChange: setSorting,
    initialPagination: { pageIndex: 0, pageSize: PROMOTER_CENTER_PAGE_SIZE },
  })
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={props.loading}
      isFetching={props.fetching}
      emptyTitle={t('No consumption in this range')}
      skeletonKeyPrefix='promoter-models-skeleton'
      fixedHeight={false}
      paginationInFooter={false}
      compactPagination
      applyHeaderSize
      toolbarProps={null}
    />
  )
}
