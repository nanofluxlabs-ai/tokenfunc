import { Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatTimestampToDate } from '@/lib/format'

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

/** 打开 Invoice 打印窗口的按钮（控制台与管理员共用） */
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
        <Printer className='h-4 w-4' />
        {t('Print / Save PDF')}
      </Button>
    )
  }
  return (
    <Button
      variant='ghost'
      size='icon-sm'
      aria-label={t('Print / Save PDF')}
      onClick={handleClick}
    >
      <Printer />
    </Button>
  )
}

type BillsTableProps = {
  bills: Bill[]
  isLoading?: boolean
  /** 额外的行操作（管理员：收款、作废） */
  renderActions?: (bill: Bill) => ReactNode
  /** 账单号的渲染（控制台：链接到详情） */
  renderBillNo?: (bill: Bill) => ReactNode
  showEnterprise?: boolean
}

export function BillsTable(props: BillsTableProps) {
  const { t } = useTranslation()
  const columns: StaticDataTableColumn<Bill>[] = [
    {
      id: 'bill_no',
      header: t('Bill No.'),
      cell: (row) => (
        <div className='flex flex-col'>
          <span className='font-mono font-medium'>
            {props.renderBillNo ? props.renderBillNo(row) : row.bill_no}
          </span>
          <span className='text-muted-foreground text-xs'>
            {t(BILL_TYPES[row.bill_type]?.labelKey ?? row.bill_type)}
          </span>
        </div>
      ),
    },
    ...(props.showEnterprise
      ? [
          {
            id: 'enterprise',
            header: t('Enterprise'),
            cell: (row: Bill) =>
              row.buyer_snapshot?.enterprise_name ?? `#${row.enterprise_id}`,
          },
        ]
      : []),
    {
      id: 'period',
      header: t('Period'),
      cell: (row) =>
        `${formatTimestampToDate(row.period_start)} ~ ${formatTimestampToDate(row.period_end)}`,
    },
    {
      id: 'total',
      header: t('Total'),
      cell: (row) => (
        <span className='font-mono'>
          {row.currency} {Number.parseFloat(row.total_usd).toFixed(2)}
        </span>
      ),
    },
    {
      id: 'paid',
      header: t('Paid'),
      cell: (row) =>
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
      cell: (row) => (row.due_at ? formatTimestampToDate(row.due_at) : '—'),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) =>
        row.bill_type === 'statement' ? '—' : <BillStatusBadge bill={row} />,
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (row) => (
        <div className='flex items-center gap-1'>
          <InvoiceButton bill={row} />
          {props.renderActions?.(row)}
        </div>
      ),
    },
  ]
  return (
    <StaticDataTable
      columns={columns}
      data={props.bills}
      getRowKey={(row) => row.id}
      getRowClassName={(row) =>
        isBillOverdue(row) ? 'bg-destructive/5' : undefined
      }
      empty={!props.isLoading && props.bills.length === 0}
      emptyContent={t('No bills yet')}
    />
  )
}
