import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FINANCE_PAGE_SIZE } from '@/features/finance/constants'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { formatTimestampToDate } from '@/lib/format'

import { TOPUP_SOURCES, TOPUP_TYPES } from '../constants'
import { useTopupDetail } from '../hooks/use-topup-queries'
import {
  formatSignedUsd,
  isTopupSource,
  paymentMethodLabel,
} from '../lib/topup-display'
import type { TopupEntry } from '../types'

const route = getRouteApi('/_authenticated/reconciliation/')

const NUMERIC = 'text-right tabular-nums'

/** 浏览器时区标签，表头标明流水时间按哪个时区展示 */
function localUtcLabel(): string {
  const offset = -new Date().getTimezoneOffset() / 60
  return `UTC${offset >= 0 ? '+' : ''}${offset}`
}

type TopupDetailTableProps = { ts_start: number; ts_end: number }

/** 充值明细：服务端分页；来源筛选与页码写在 URL 上 */
export function TopupDetailTable(props: TopupDetailTableProps) {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const source = isTopupSource(search.source) ? search.source : 'all'
  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: {
        pageKey: 'page',
        pageSizeKey: 'pageSize',
        defaultPage: 1,
        defaultPageSize: FINANCE_PAGE_SIZE,
      },
      globalFilter: { enabled: false },
    })
  const query = useTopupDetail({
    ts_start: props.ts_start,
    ts_end: props.ts_end,
    source: source === 'all' ? undefined : source,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
  })

  const columns = useMemo<ColumnDef<TopupEntry, unknown>[]>(
    () => [
      {
        id: 'time',
        header: `${t('Time')} (${localUtcLabel()})`,
        meta: { mobileTitle: true },
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatTimestampToDate(row.original.created_at)}
          </span>
        ),
        size: 170,
      },
      {
        id: 'type',
        header: t('Type'),
        meta: { mobileOrder: 10 },
        cell: ({ row }) => t(TOPUP_TYPES[row.original.type].labelKey),
        size: 110,
      },
      {
        id: 'source',
        header: t('Source'),
        meta: { mobileOrder: 20 },
        cell: ({ row }) => (
          <StatusBadge variant='neutral' size='sm'>
            {t(TOPUP_SOURCES[row.original.source].labelKey)}
          </StatusBadge>
        ),
        size: 140,
      },
      {
        id: 'payment_method',
        header: t('Payment method'),
        meta: { mobileOrder: 30 },
        cell: ({ row }) => paymentMethodLabel(row.original.payment_method, t),
        size: 130,
      },
      {
        id: 'amount',
        header: () => <div className={NUMERIC}>{t('Amount (USD)')}</div>,
        meta: { label: t('Amount (USD)'), mobileBadge: true },
        cell: ({ row }) => (
          <div
            className={
              row.original.quota < 0 ? `${NUMERIC} text-destructive` : NUMERIC
            }
          >
            {formatSignedUsd(row.original.amount_usd)}
          </div>
        ),
        size: 130,
      },
      {
        id: 'ref_no',
        header: t('Reference'),
        meta: { mobileHidden: true },
        cell: ({ row }) => (
          <span className='font-mono text-xs'>
            {row.original.ref_no || '-'}
          </span>
        ),
        size: 160,
      },
      {
        id: 'content',
        header: t('Remark'),
        meta: { mobileOrder: 40 },
        // 触屏没有悬停：手机卡片里最多显示两行，桌面仍单行截断加 title
        cell: ({ row }) => (
          <span
            className='line-clamp-2 block sm:line-clamp-none sm:max-w-[320px] sm:truncate'
            title={row.original.content}
          >
            {row.original.content || '-'}
          </span>
        ),
      },
    ],
    [t]
  )

  const { table } = useDataTable({
    data: query.data?.items ?? [],
    columns,
    getRowId: (row) => row.id,
    pagination,
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    enableSorting: false,
    totalCount: query.data?.total ?? 0,
    ensurePageInRange,
  })

  const sourceOptions = [
    { value: 'all', label: t('All sources') },
    ...Object.entries(TOPUP_SOURCES).map(([value, config]) => ({
      value,
      label: t(config.labelKey),
    })),
  ]

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      emptyTitle={t('No wallet entries in this period')}
      skeletonKeyPrefix='reconciliation-topup-skeleton'
      fixedHeight={false}
      paginationInFooter={false}
      applyHeaderSize
      toolbar={
        <Select
          items={sourceOptions}
          value={source}
          onValueChange={(value) =>
            value !== null &&
            void navigate({
              search: (previous) => ({
                ...previous,
                source: value === 'all' ? undefined : String(value),
                page: undefined,
              }),
            })
          }
        >
          <SelectTrigger aria-label={t('Source')} className='w-full md:w-56'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {sourceOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  )
}
