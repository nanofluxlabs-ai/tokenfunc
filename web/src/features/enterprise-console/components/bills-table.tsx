import type {
  CellContext,
  ColumnDef,
  OnChangeFn,
  PaginationState,
} from '@tanstack/react-table'
import { Check, Download, FileText } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { readBlobError, saveBlob } from '@/features/finance/lib/csv'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { downloadBillCsv, type BillExportScope } from '../api'
import { BILL_STATUSES, BILL_TYPES } from '../constants'
import { isBillOverdue } from '../lib/bill-utils'
import { openInvoicePrintWindow } from '../lib/invoice-html'
import type { Bill } from '../types'

export function BillStatusBadge(props: { bill: Bill }) {
  const { t } = useTranslation()
  if (isBillOverdue(props.bill)) {
    return (
      <StatusBadge label={t('Overdue')} variant='danger' copyable={false} />
    )
  }
  const config = BILL_STATUSES[props.bill.status]
  return (
    <StatusBadge
      label={t(config?.labelKey ?? props.bill.status)}
      variant={config?.variant ?? 'neutral'}
      copyable={false}
    />
  )
}

/** 「导出发票」：新窗口打开 Invoice 并调起打印，用户在打印对话框另存为 PDF（控制台与管理员共用） */
export function InvoiceButton(props: { bill: Bill; size?: 'sm' | 'icon-sm' }) {
  const { t } = useTranslation()
  const handleClick = () => {
    if (!openInvoicePrintWindow(props.bill, t)) {
      toast.error(t('Please allow pop-ups to print the invoice.'))
    }
  }
  if (props.size === 'sm') {
    return (
      <Button variant='outline' size='sm' onClick={handleClick}>
        <FileText className='h-4 w-4' />
        {t('Export invoice')}
      </Button>
    )
  }
  return (
    <Button
      variant='ghost'
      size='icon-sm'
      aria-label={t('Export invoice')}
      onClick={handleClick}
    >
      <FileText />
    </Button>
  )
}

/** 「导出 CSV」：服务端生成（已归档透传冻结件，否则由快照 v2 还原），与详情页、Invoice 同口径 */
export function BillExportCsvButton(props: {
  bill: Bill
  scope: BillExportScope
  size?: 'sm' | 'icon-sm'
}) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)
  const handleClick = async () => {
    setExporting(true)
    try {
      const blob = await downloadBillCsv(props.bill.id, props.scope)
      const message = await readBlobError(blob)
      if (message) {
        toast.error(message)
        return
      }
      saveBlob(blob, `${props.bill.bill_no}.csv`)
    } catch (error) {
      handleServerError(error, t('Download failed'))
    } finally {
      setExporting(false)
    }
  }
  if (props.size === 'sm') {
    return (
      <Button
        variant='outline'
        size='sm'
        disabled={exporting}
        onClick={() => void handleClick()}
      >
        <Download className='h-4 w-4' />
        {exporting ? t('Exporting...') : t('Export CSV')}
      </Button>
    )
  }
  return (
    <Button
      variant='ghost'
      size='icon-sm'
      aria-label={t('Export CSV')}
      disabled={exporting}
      onClick={() => void handleClick()}
    >
      <Download />
    </Button>
  )
}

type BillsTableProps = {
  bills: Bill[]
  isLoading?: boolean
  isFetching?: boolean
  /** 服务端分页：传了 pagination 才显示分页条，total 为服务端总数 */
  total?: number
  pagination?: PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  /** 分页条挂到页脚（需要 SectionPageLayout fixedContent）还是跟在表格下面 */
  paginationInFooter?: boolean
  /** 账单 CSV 走哪条路由：企业控制台 / 管理员财务中心 */
  exportScope: BillExportScope
  /** 额外的行操作（管理员：收款、作废） */
  renderActions?: (bill: Bill) => ReactNode
  /** 账单号的渲染（控制台：链接到详情） */
  renderBillNo?: (bill: Bill) => ReactNode
  showEnterprise?: boolean
  /** 管理员：显示对账差异列（企业侧不展示） */
  showReconcile?: boolean
}

/** 对账差异单元格：无差异「—」，未核对给 warning 徽标，已核对给确认人 */
export function ReconcileDiffCell(props: { bill: Bill }) {
  const { t } = useTranslation()
  if (
    props.bill.bill_type !== 'credit' ||
    props.bill.reconcile_diff_quota === 0
  ) {
    return <>—</>
  }
  const diff = formatQuotaWithCurrency(props.bill.reconcile_diff_quota)
  if (props.bill.reconcile_acked_at > 0) {
    return (
      <div className='flex flex-col text-xs'>
        <span className='inline-flex items-center gap-1'>
          <Check className='text-success h-3.5 w-3.5' aria-hidden='true' />
          {t('Reconciled')}
        </span>
        <span className='text-muted-foreground'>
          {t('by #{{id}}', { id: props.bill.reconcile_acked_by })} · {diff}
        </span>
      </div>
    )
  }
  return (
    <StatusBadge
      label={`${t('Diff')} ${diff}`}
      variant='warning'
      copyable={false}
    />
  )
}

/** 账单列表：企业控制台与管理员财务中心共用，类型作独立列，行操作固定为导出发票 + 导出 CSV */
export function BillsTable(props: BillsTableProps) {
  const { t } = useTranslation()
  const columns: ColumnDef<Bill>[] = [
    {
      id: 'bill_no',
      header: t('Bill No.'),
      cell: ({ row: { original: row } }) => (
        <span className='font-mono font-medium'>
          {props.renderBillNo ? props.renderBillNo(row) : row.bill_no}
        </span>
      ),
    },
    {
      id: 'type',
      header: t('Type'),
      cell: ({ row: { original: row } }) =>
        t(BILL_TYPES[row.bill_type]?.labelKey ?? row.bill_type),
    },
    ...(props.showEnterprise
      ? [
          {
            id: 'enterprise',
            header: t('Enterprise'),
            cell: ({ row: { original: row } }: CellContext<Bill, unknown>) =>
              row.buyer_snapshot?.enterprise_name ?? `#${row.enterprise_id}`,
          },
        ]
      : []),
    {
      id: 'period',
      header: t('Period'),
      cell: ({ row: { original: row } }) =>
        `${formatTimestampToDate(row.period_start)} ~ ${formatTimestampToDate(row.period_end)}`,
    },
    {
      id: 'total',
      header: t('Total'),
      cell: ({ row: { original: row } }) => (
        <span className='font-mono'>
          {row.currency} {Number.parseFloat(row.total_usd).toFixed(2)}
        </span>
      ),
    },
    {
      id: 'paid',
      header: t('Paid'),
      cell: ({ row: { original: row } }) =>
        row.bill_type === 'statement' ? (
          '—'
        ) : (
          <span className='font-mono'>
            {Number.parseFloat(row.paid_usd).toFixed(2)}
          </span>
        ),
    },
    {
      id: 'due',
      header: t('Due'),
      cell: ({ row: { original: row } }) =>
        row.due_at ? formatTimestampToDate(row.due_at) : '—',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: ({ row: { original: row } }) =>
        row.bill_type === 'statement' ? '—' : <BillStatusBadge bill={row} />,
    },
    ...(props.showReconcile
      ? [
          {
            id: 'reconcile',
            header: t('Reconciliation'),
            cell: ({ row: { original: row } }: CellContext<Bill, unknown>) => (
              <ReconcileDiffCell bill={row} />
            ),
          },
        ]
      : []),
    {
      id: 'actions',
      header: t('Actions'),
      enableHiding: false,
      cell: ({ row: { original: row } }) => (
        <div className='flex items-center gap-1'>
          <InvoiceButton bill={row} />
          <BillExportCsvButton bill={row} scope={props.exportScope} />
          {props.renderActions?.(row)}
        </div>
      ),
    },
  ]
  const { table } = useDataTable({
    data: props.bills,
    columns,
    pagination: props.pagination,
    onPaginationChange: props.onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: props.total ?? props.bills.length,
    enableRowSelection: false,
  })
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={props.isLoading}
      isFetching={props.isFetching}
      emptyTitle={t('No bills yet')}
      emptyIcon={<FileText />}
      skeletonKeyPrefix='bill-skeleton'
      showPagination={props.pagination !== undefined}
      paginationInFooter={props.paginationInFooter}
      getRowClassName={(row) =>
        isBillOverdue(row.original) ? 'bg-destructive/5' : undefined
      }
    />
  )
}
