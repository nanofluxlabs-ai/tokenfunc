import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { CREDIT_PERIOD_STATUSES } from '@/features/enterprise-console/constants'
import { formatTimestampToDate, quotaUnitsToDollars } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listFinanceBills } from '../../api'
import { FINANCE_QUERY_KEY } from '../../constants'
import { creditUsagePercent, formatBillRef } from '../../lib/bill-ref'
import type { FinanceBillSummary } from '../../types'
import { ShareBar } from '../share-bar'

/** 进行中 / 待出账的授信账期：实时数据，可点进详情 */
export function OpenPeriodsTable() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: [FINANCE_QUERY_KEY, 'bills', 'open-periods'],
    queryFn: async () =>
      requireServerSuccess(
        await listFinanceBills({ include_open: 1, p: 1, page_size: 1 })
      ).data?.open_periods ?? [],
  })
  const rows = data ?? []
  if (!isLoading && rows.length === 0) return null

  const columns: StaticDataTableColumn<FinanceBillSummary>[] = [
    {
      id: 'period',
      header: t('Period'),
      cell: (row) => (
        <Link
          to='/finance/bills/$billId'
          params={{ billId: formatBillRef({ kind: 'period', id: row.id }) }}
          className='text-primary font-medium hover:underline'
        >
          {t('Period #{{no}}', { no: row.period_no })}
        </Link>
      ),
    },
    {
      id: 'enterprise',
      header: t('Enterprise'),
      cell: (row) => row.enterprise_name,
    },
    {
      id: 'range',
      header: t('Period range'),
      cell: (row) =>
        `${formatTimestampToDate(row.period_start).slice(0, 10)} ~ ${formatTimestampToDate(row.period_end - 1).slice(0, 10)}`,
    },
    {
      id: 'usage',
      header: t('Used / Credit (USD)'),
      className: 'text-right',
      cell: (row) => (
        <div className='flex justify-end'>
          <ShareBar
            value={`$${quotaUnitsToDollars(row.used_quota).toFixed(2)} / $${quotaUnitsToDollars(row.limit_quota).toFixed(2)}`}
            percentage={
              creditUsagePercent(row.used_quota, row.limit_quota) ?? 0
            }
          />
        </div>
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => {
        const config = CREDIT_PERIOD_STATUSES[row.status]
        return (
          <StatusBadge
            label={
              row.status === 'open'
                ? t('In progress')
                : t(config?.labelKey ?? row.status)
            }
            variant={config?.variant ?? 'info'}
            copyable={false}
          />
        )
      },
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (row) => (
        <Link
          to='/finance/bills/$billId'
          params={{ billId: formatBillRef({ kind: 'period', id: row.id }) }}
          className='text-primary text-sm hover:underline'
        >
          {t('View details')}
        </Link>
      ),
    },
  ]
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-sm font-semibold'>{t('Open credit periods')}</h3>
      <StaticDataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.id}
        empty={!isLoading && rows.length === 0}
        emptyContent={t('No open periods')}
      />
    </section>
  )
}
