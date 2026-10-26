import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { requireServerSuccess } from '@/lib/server-error-message'

import { getFinanceBill } from '../../api'
import { FINANCE_QUERY_KEY } from '../../constants'
import { parseBillRef } from '../../lib/bill-ref'
import { buildUsageCsvFilename } from '../../lib/csv'
import type { FinanceBillContext } from '../../types'
import { ExportCsvControl } from '../usage-breakdown/export-csv-control'
import { BillArchiveControl } from './bill-archive-control'
import { billDay } from './bill-day'
import { BillDetailView } from './bill-detail-view'
import { ReconcileAckDialog } from './reconcile-diff-alert'

const route = getRouteApi('/_authenticated/finance/bills/$billId')

/** 管理员财务中心的账单详情：在共用骨架上加账期包归档、进行中账期导出与对账核对 */
export function BillDetailPage() {
  const { t } = useTranslation()
  const params = route.useParams()
  const ref = parseBillRef(params.billId)
  const { data, isLoading, isError } = useQuery({
    queryKey: [FINANCE_QUERY_KEY, 'bill', ref?.kind, ref?.id],
    queryFn: async () =>
      ref
        ? (requireServerSuccess(await getFinanceBill(ref.kind, ref.id)).data ??
          null)
        : null,
    enabled: ref !== null,
    meta: { errorToast: false },
  })
  const [ackOpen, setAckOpen] = useState(false)

  const adminActions = (context: FinanceBillContext) => (
    <>
      {context.bill && <BillArchiveControl bill={context.bill} />}
      {context.kind === 'period' && (
        <ExportCsvControl
          scope='admin'
          user_id={context.summary.user_id}
          ts_start={context.usage_ts_start}
          ts_end={context.usage_ts_end}
          filename={buildUsageCsvFilename(
            context.summary.enterprise_name,
            billDay(context.summary.period_start),
            billDay(context.summary.period_end - 1),
            t('statement')
          )}
        />
      )}
    </>
  )

  return (
    <>
      <BillDetailView
        scope='admin'
        context={data}
        isLoading={isLoading}
        notFound={!ref || (!isLoading && (isError || !data))}
        backLink={
          <Link
            to='/finance/$section'
            params={{ section: 'enterprise-bills' }}
          />
        }
        adminActions={adminActions}
        onAckReconcile={() => setAckOpen(true)}
      />
      <ReconcileAckDialog
        bill={data?.bill ?? null}
        open={ackOpen}
        onOpenChange={setAckOpen}
      />
    </>
  )
}
