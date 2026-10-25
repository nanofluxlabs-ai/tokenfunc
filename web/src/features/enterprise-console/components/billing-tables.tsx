import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'

import { CREDIT_PERIOD_STATUSES, LEDGER_TYPES } from '../constants'
import { formatCreditPeriodRange } from '../lib/credit-period'
import type { CreditPeriod, LedgerEntry } from '../types'

/** 资金流水表（企业控制台与管理员共用） */
export function LedgerTable(props: {
  entries: LedgerEntry[]
  isLoading?: boolean
}) {
  const { t } = useTranslation()
  const columns: StaticDataTableColumn<LedgerEntry>[] = [
    {
      id: 'time',
      header: t('Time'),
      cell: (row) => formatTimestampToDate(row.created_at),
    },
    {
      id: 'type',
      header: t('Type'),
      cell: (row) => t(LEDGER_TYPES[row.type]?.labelKey ?? row.type),
    },
    {
      id: 'amount',
      header: t('Amount'),
      cell: (row) => (
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
      cell: (row) =>
        row.type === 'topup' ? (
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
      cell: (row) => row.reference || '—',
    },
    { id: 'remark', header: t('Remark'), cell: (row) => row.remark || '—' },
  ]
  return (
    <StaticDataTable
      columns={columns}
      data={props.entries}
      getRowKey={(row) => row.id}
      empty={!props.isLoading && props.entries.length === 0}
      emptyContent={t('No ledger entries yet')}
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
