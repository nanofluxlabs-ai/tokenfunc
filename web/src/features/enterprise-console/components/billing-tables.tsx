import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
} from '@tanstack/react-table'
import { Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePage,
  StaticDataTable,
  type StaticDataTableColumn,
  useDataTable,
} from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'

import { CREDIT_PERIOD_STATUSES, LEDGER_TYPES } from '../constants'
import { formatCreditPeriodRange } from '../lib/credit-period'
import type { CreditPeriod, LedgerEntry } from '../types'

/** 资金流水表（企业控制台与管理员共用）；传 pagination 走服务端分页，不传（管理员抽屉）只列最近若干条 */
export function LedgerTable(props: {
  entries: LedgerEntry[]
  isLoading?: boolean
  isFetching?: boolean
  total?: number
  pagination?: PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  paginationInFooter?: boolean
}) {
  const { t } = useTranslation()
  const columns: ColumnDef<LedgerEntry>[] = [
    {
      id: 'time',
      header: t('Time'),
      cell: ({ row: { original: row } }) =>
        formatTimestampToDate(row.created_at),
    },
    {
      id: 'type',
      header: t('Type'),
      cell: ({ row: { original: row } }) =>
        t(LEDGER_TYPES[row.type]?.labelKey ?? row.type),
    },
    {
      id: 'amount',
      header: t('Amount'),
      cell: ({ row: { original: row } }) => (
        <span className='font-mono'>
          {row.amount_quota === 0
            ? '—'
            : formatQuotaWithCurrency(row.amount_quota)}
        </span>
      ),
    },
    {
      id: 'balance',
      header: t('Balance After'),
      // 只有动余额的流水（充值、钱包调账）才有期后余额
      cell: ({ row: { original: row } }) =>
        row.type === 'topup' || row.ref_type === 'wallet' ? (
          <span className='font-mono'>
            {formatQuotaWithCurrency(row.balance_after_quota)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      id: 'reference',
      header: t('Reference'),
      cell: ({ row: { original: row } }) => row.reference || '—',
    },
    {
      id: 'remark',
      header: t('Remark'),
      cell: ({ row: { original: row } }) => row.remark || '—',
    },
  ]
  const { table } = useDataTable({
    data: props.entries,
    columns,
    pagination: props.pagination,
    onPaginationChange: props.onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: props.total ?? props.entries.length,
    enableRowSelection: false,
  })
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={props.isLoading}
      isFetching={props.isFetching}
      emptyTitle={t('No ledger entries yet')}
      emptyIcon={<Receipt />}
      skeletonKeyPrefix='ledger-skeleton'
      showPagination={props.pagination !== undefined}
      paginationInFooter={props.paginationInFooter}
    />
  )
}

/** 授信账期表 */
export function CreditPeriodsTable(props: {
  periods: CreditPeriod[]
  isLoading?: boolean
  /** 管理员：对 closing 期立即出账（不等在途请求清零） */
  onIssueNow?: (period: CreditPeriod) => void
}) {
  const { t } = useTranslation()
  const columns: StaticDataTableColumn<CreditPeriod>[] = [
    { id: 'no', header: t('Period'), cell: (row) => `#${row.period_no}` },
    {
      id: 'range',
      header: t('Date Range'),
      cell: (row) => formatCreditPeriodRange(row, formatTimestampToDate),
    },
    {
      id: 'limit',
      header: t('Credit Limit'),
      cell: (row) => formatQuotaWithCurrency(row.limit_quota),
    },
    {
      id: 'used',
      header: t('Used'),
      cell: (row) => formatQuotaWithCurrency(row.used_quota),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => {
        const config = CREDIT_PERIOD_STATUSES[row.status]
        return (
          <StatusBadge
            label={t(config?.labelKey ?? row.status)}
            variant={config?.variant ?? 'neutral'}
            copyable={false}
          />
        )
      },
    },
    ...(props.onIssueNow
      ? [
          {
            id: 'actions',
            header: t('Actions'),
            cell: (row: CreditPeriod) =>
              row.status === 'closing' ? (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => props.onIssueNow?.(row)}
                >
                  {t('Issue bill now')}
                </Button>
              ) : null,
          },
        ]
      : []),
  ]
  return (
    <StaticDataTable
      columns={columns}
      data={props.periods}
      getRowKey={(row) => row.id}
      empty={!props.isLoading && props.periods.length === 0}
      emptyContent={t('No credit periods yet')}
    />
  )
}
