import type { ColumnDef, PaginationState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatTimestampToDate } from '@/lib/format'

import { FINANCE_PAGE_SIZE } from '../../constants'
import { useUsageDetail } from '../../hooks/use-usage-breakdown-queries'
import { hasCacheWrite1h } from '../../lib/usage-breakdown'
import type { UsageDetailRow, UsageRangeParams } from '../../types'

const NUM = 'text-right tabular-nums'
// 数字单元格：桌面表格右对齐；手机卡片里左对齐，紧跟字段名
const NUM_CELL = 'tabular-nums sm:text-right'

/** 浏览器时区标签，表头标明明细时间按哪个时区展示 */
function localUtcLabel(): string {
  const offset = -new Date().getTimezoneOffset() / 60
  return `UTC${offset >= 0 ? '+' : ''}${offset}`
}

/** 消费明细：服务端分页，每页 20 条，时间倒序 */
export function UsageDetailTable(props: UsageRangeParams) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: FINANCE_PAGE_SIZE,
  })
  const query = useUsageDetail({
    ...props,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
  })
  const rows = useMemo(() => query.data?.items ?? [], [query.data])
  const split1h = useMemo(() => hasCacheWrite1h(rows), [rows])

  const columns = useMemo<ColumnDef<UsageDetailRow, unknown>[]>(() => {
    const number = (value: number) => formatNumber(value, locale)
    const numeric = (
      id: string,
      header: string,
      value: (row: UsageDetailRow) => number
    ): ColumnDef<UsageDetailRow, unknown> => ({
      id,
      header: () => <div className={NUM}>{header}</div>,
      // 函数表头在手机卡片上取不到文字，label 给卡片当字段名
      meta: { label: header },
      cell: ({ row }) => (
        <div className={NUM_CELL}>{number(value(row.original))}</div>
      ),
      size: 110,
    })
    return [
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
        id: 'model',
        header: t('Model'),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.model_name}</span>
        ),
        size: 180,
      },
      {
        id: 'token',
        header: 'Token',
        cell: ({ row }) => row.original.token_name || '-',
        size: 140,
      },
      numeric('input', t('Input tokens'), (row) => row.input_tokens),
      numeric('cached', t('Cache hits'), (row) => row.cached_tokens),
      numeric(
        'cache_write',
        split1h ? t('Cache writes (5m)') : t('Cache writes'),
        (row) => row.cache_creation_tokens - row.cache_creation_1h_tokens
      ),
      ...(split1h
        ? [
            numeric(
              'cache_write_1h',
              t('Cache writes (1h)'),
              (row) => row.cache_creation_1h_tokens
            ),
          ]
        : []),
      numeric('output', t('Output tokens'), (row) => row.completion_tokens),
      {
        id: 'amount',
        header: () => <div className={NUM}>{t('Amount (USD)')}</div>,
        // 金额是这一行最关键的数，手机卡片放到右上角与时间同行
        meta: { label: t('Amount (USD)'), mobileBadge: true },
        cell: ({ row }) => (
          <div className={`${NUM_CELL} font-mono`}>
            ${Number.parseFloat(row.original.amount_usd).toFixed(6)}
          </div>
        ),
        size: 130,
      },
    ]
  }, [t, locale, split1h])

  const { table } = useDataTable({
    data: rows,
    columns,
    getRowId: (row, index) => `${row.created_at}-${index}`,
    pagination,
    onPaginationChange: setPagination,
    manualPagination: true,
    enableSorting: false,
    totalCount: query.data?.total ?? 0,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      emptyTitle={t('No usage')}
      skeletonKeyPrefix='finance-usage-detail-skeleton'
      fixedHeight={false}
      paginationInFooter={false}
      compactPagination
      applyHeaderSize
      toolbarProps={null}
    />
  )
}
