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
import type { FinanceBillSummary } from '@/features/finance/types'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { downloadBillCsv, type BillExportScope } from '../api'
import { BILL_STATUSES, BILL_TYPES, CREDIT_PERIOD_STATUSES } from '../constants'
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

/** 账单表的一行：已出账账单，或进行中 / 待出账的授信账期（只有财务中心会传） */
export type BillsTableRow =
  | { kind: 'bill'; bill: Bill }
  | { kind: 'period'; period: FinanceBillSummary }

type BillsTableProps = {
  rows: BillsTableRow[]
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
  /** 账期行「账单号」位置的渲染（财务中心：链接到账期详情） */
  renderPeriodNo?: (period: FinanceBillSummary) => ReactNode
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

/** 账期行的状态徽标：open 显示「进行中」，其余按账期状态表 */
function PeriodStatusBadge(props: { period: FinanceBillSummary }) {
  const { t } = useTranslation()
  const config = CREDIT_PERIOD_STATUSES[props.period.status]
  return (
    <StatusBadge
      label={
        props.period.status === 'open'
          ? t('In progress')
          : t(config?.labelKey ?? props.period.status)
      }
      variant={config?.variant ?? 'info'}
      copyable={false}
    />
  )
}

/** 只对账单行有内容的单元格，账期行显示「—」 */
const billCell =
  (render: (bill: Bill) => ReactNode) =>
  ({ row }: CellContext<BillsTableRow, unknown>) =>
    row.original.kind === 'bill' ? render(row.original.bill) : '—'

/** 账单列表：企业控制台与管理员财务中心共用，账期行与账单行同一张表，行操作固定为导出发票 + 导出 CSV */
export function BillsTable(props: BillsTableProps) {
  const { t } = useTranslation()
  const columns: ColumnDef<BillsTableRow>[] = [
    {
      id: 'bill_no',
      header: t('Bill No.'),
      cell: ({ row: { original } }) => (
        <span className='font-mono font-medium'>
          {original.kind === 'bill'
            ? (props.renderBillNo?.(original.bill) ?? original.bill.bill_no)
            : (props.renderPeriodNo?.(original.period) ??
              t('Period #{{no}}', { no: original.period.period_no }))}
        </span>
      ),
    },
    {
      id: 'type',
      header: t('Type'),
      cell: ({ row: { original } }) =>
        original.kind === 'bill'
          ? t(
              BILL_TYPES[original.bill.bill_type]?.labelKey ??
                original.bill.bill_type
            )
          : t('Credit period'),
    },
    ...(props.showEnterprise
      ? [
          {
            id: 'enterprise',
            header: t('Enterprise'),
            cell: ({
              row: { original },
            }: CellContext<BillsTableRow, unknown>) =>
              original.kind === 'bill'
                ? (original.bill.buyer_snapshot?.enterprise_name ??
                  `#${original.bill.enterprise_id}`)
                : original.period.enterprise_name,
          },
        ]
      : []),
    {
      id: 'period',
      header: t('Period'),
      cell: ({ row: { original } }) => {
        const range = original.kind === 'bill' ? original.bill : original.period
        return `${formatTimestampToDate(range.period_start)} ~ ${formatTimestampToDate(range.period_end)}`
      },
    },
    {
      id: 'total',
      header: t('Total'),
      cell: ({ row: { original } }) =>
        original.kind === 'bill' ? (
          <span className='font-mono'>
            {original.bill.currency}{' '}
            {Number.parseFloat(original.bill.total_usd).toFixed(2)}
          </span>
        ) : (
          <span className='font-mono'>
            {formatQuotaWithCurrency(original.period.used_quota)} /{' '}
            {formatQuotaWithCurrency(original.period.limit_quota)}
          </span>
        ),
    },
    {
      id: 'paid',
      header: t('Paid'),
      cell: billCell((bill) =>
        bill.bill_type === 'statement' ? (
          '—'
        ) : (
          <span className='font-mono'>
            {Number.parseFloat(bill.paid_usd).toFixed(2)}
          </span>
        )
      ),
    },
    {
      id: 'due',
      header: t('Due'),
      cell: billCell((bill) =>
        bill.due_at ? formatTimestampToDate(bill.due_at) : '—'
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: ({ row: { original } }) => {
        if (original.kind === 'period') {
          return <PeriodStatusBadge period={original.period} />
        }
        return original.bill.bill_type === 'statement' ? (
          '—'
        ) : (
          <BillStatusBadge bill={original.bill} />
        )
      },
    },
    ...(props.showReconcile
      ? [
          {
            id: 'reconcile',
            header: t('Reconciliation'),
            cell: billCell((bill) => <ReconcileDiffCell bill={bill} />),
          },
        ]
      : []),
    {
      id: 'actions',
      header: t('Actions'),
      enableHiding: false,
      cell: billCell((bill) => (
        <div className='flex items-center gap-1'>
          <InvoiceButton bill={bill} />
          <BillExportCsvButton bill={bill} scope={props.exportScope} />
          {props.renderActions?.(bill)}
        </div>
      )),
    },
  ]
  const { table } = useDataTable({
    data: props.rows,
    columns,
    pagination: props.pagination,
    onPaginationChange: props.onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: props.total ?? props.rows.length,
    enableRowSelection: false,
    getRowId: (row) =>
      row.kind === 'bill' ? `bill-${row.bill.id}` : `period-${row.period.id}`,
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
        row.original.kind === 'bill' && isBillOverdue(row.original.bill)
          ? 'bg-destructive/5'
          : undefined
      }
    />
  )
}
