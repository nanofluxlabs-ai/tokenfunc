import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  BillExportCsvButton,
  BillStatusBadge,
  InvoiceButton,
} from '@/features/enterprise-console/components/bills-table'
import { CREDIT_PERIOD_STATUSES } from '@/features/enterprise-console/constants'
import { isBillSnapshotV2 } from '@/features/enterprise-console/types'
import { toIntlLocale } from '@/i18n/languages'
import {
  formatNumber,
  formatTimestampToDate,
  quotaUnitsToDollars,
} from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getFinanceBill } from '../../api'
import { FINANCE_QUERY_KEY } from '../../constants'
import { useUsageSummary } from '../../hooks/use-usage-breakdown-queries'
import {
  creditUsagePercent,
  parseBillRef,
  periodDays,
} from '../../lib/bill-ref'
import { buildUsageCsvFilename } from '../../lib/csv'
import type { FinanceBillContext, UsageRangeParams } from '../../types'
import { MetricCard } from '../metric-card'
import { SectionBlock as Block } from '../section-block'
import { BillSnapshotSection } from '../usage-breakdown/bill-snapshot-section'
import { ExportCsvControl } from '../usage-breakdown/export-csv-control'
import { UsageBreakdownSection } from '../usage-breakdown/usage-breakdown-section'
import { UsageDetailTable } from '../usage-breakdown/usage-detail-table'
import { BillArchiveControl } from './bill-archive-control'
import { ReconcileAckDialog, ReconcileDiffAlert } from './reconcile-diff-alert'

const route = getRouteApi('/_authenticated/finance/bills/$billId')

function day(timestamp: number): string {
  return formatTimestampToDate(timestamp).slice(0, 10)
}

/**
 * 账单详情正文：头部提示 + 汇总卡 + 明细。导出供页面与测试复用。
 * 已出账且快照为 v2 的账单直接渲染出账时冻结的快照（与企业侧同口径），不再实时扫 logs；
 * 进行中账期与旧快照账单维持实时聚合。
 * 已出账账单的用量请求都带 bill_id：账期 logs 被清理且账期包有冻结件时，后端把逐条明细切到冻结件（usage_source=archive）。
 */
export function BillDetailContent(props: {
  context: FinanceBillContext
  /** 点击「标记已核对」：由页面在布局槽位外打开确认框 */
  onAckReconcile?: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const context = props.context
  const summary = context.summary
  const isOpenPeriod = context.kind === 'period'
  const billSnapshot = context.bill?.usage_snapshot
  const frozen =
    context.kind === 'bill' && isBillSnapshotV2(billSnapshot)
      ? billSnapshot
      : null
  const usageParams: UsageRangeParams = {
    scope: 'admin',
    user_id: summary.user_id,
    bill_id: context.bill?.id,
    ts_start: context.usage_ts_start,
    ts_end: context.usage_ts_end,
  }
  const archivedDay = context.bill?.archived_at
    ? day(context.bill.archived_at)
    : ''
  const usageSource = context.usage_source ?? 'live'
  const usage = useUsageSummary({ ...usageParams, enabled: frozen === null })
  const usagePercent = creditUsagePercent(
    summary.used_quota,
    summary.limit_quota
  )
  const days = periodDays(summary.period_start, summary.period_end)
  const cycleLabel =
    context.enterprise?.credit_cycle_type === 'natural_month'
      ? `${t('Calendar month')} · ${t('{{count}} days', { count: days })}`
      : t('{{count}} days', { count: days })
  const limitUsd = quotaUnitsToDollars(summary.limit_quota)

  return (
    <div className='flex flex-col gap-4'>
      {isOpenPeriod && (
        <Alert className='border-warning/40 bg-warning/10'>
          <AlertDescription>
            {t(
              'This period is still open: figures are live and keep changing until the bill is issued.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {usageSource === 'archive' && (
        <Alert>
          <AlertDescription>
            {t(
              'Raw logs of this period have been purged; the row-level detail below is read from the statement snapshot archived on {{date}}.',
              { date: archivedDay }
            )}
          </AlertDescription>
        </Alert>
      )}
      {context.logs_purged && usageSource !== 'archive' && (
        <Alert className='border-warning/40 bg-warning/10'>
          <AlertDescription>
            {t(
              'Raw logs of this period have been archived and purged; the breakdown below may be incomplete. Use the archived statement snapshot as the source of truth.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {frozen && (
        <Alert>
          <AlertDescription>
            {t(
              'Settled bill: the breakdown below is the usage snapshot frozen at issue time.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {context.bill && (
        <ReconcileDiffAlert
          bill={context.bill}
          onAck={props.onAckReconcile ?? (() => {})}
        />
      )}
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
        <MetricCard
          label={t('Total amount (USD)')}
          value={`$${Number.parseFloat(summary.total_usd).toFixed(4)}`}
        />
        {summary.limit_quota > 0 && (
          <MetricCard
            label={t('Credit limit (USD)')}
            value={`$${limitUsd.toFixed(2)}`}
          />
        )}
        {usagePercent != null && (
          <MetricCard
            label={t('Usage rate')}
            value={`${usagePercent.toFixed(2)}%`}
          />
        )}
        <MetricCard
          label={t('Period')}
          value={
            <span className='text-lg'>
              {day(summary.period_start)} ~ {day(summary.period_end - 1)}
            </span>
          }
          hint={cycleLabel}
        />
        <MetricCard
          label={t('Requests')}
          value={formatNumber(
            frozen ? frozen.logs_total_calls : (usage.data?.total_calls ?? 0),
            locale
          )}
          loading={frozen === null && usage.isLoading}
        />
      </div>
      {frozen ? (
        <>
          <BillSnapshotSection
            snapshot={frozen}
            amountQuota={summary.amount_quota}
          />
          <Block title={t('Usage detail')}>
            <p className='text-muted-foreground border-b px-4 py-2 text-xs'>
              {t(
                'Row-level detail for settled bills follows the archived statement snapshot.'
              )}
            </p>
            <div className='p-2'>
              <UsageDetailTable {...usageParams} />
            </div>
          </Block>
        </>
      ) : (
        <UsageBreakdownSection {...usageParams} />
      )}
    </div>
  )
}

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
  const summary = data?.summary
  const title = summary
    ? summary.bill_no || t('Period #{{no}}', { no: summary.period_no })
    : t('Bill')

  const [ackOpen, setAckOpen] = useState(false)

  let content = <LoadingState />
  if (!ref || (!isLoading && (isError || !data))) {
    content = <EmptyState title={t('Bill not found')} />
  } else if (data) {
    content = (
      <BillDetailContent
        context={data}
        onAckReconcile={() => setAckOpen(true)}
      />
    )
  }

  let statusBadge: React.ReactNode = null
  if (data?.bill) {
    statusBadge = <BillStatusBadge bill={data.bill} />
  } else if (data?.period) {
    const config = CREDIT_PERIOD_STATUSES[data.period.status]
    statusBadge = (
      <StatusBadge
        label={
          data.period.status === 'open'
            ? t('In progress')
            : t(config?.labelKey ?? data.period.status)
        }
        variant={config?.variant ?? 'info'}
        copyable={false}
      />
    )
  }

  return (
    <>
      <SectionPageLayout stackActionsOnMobile>
        <SectionPageLayout.Title>
          <span className='inline-flex flex-wrap items-center gap-2'>
            <span className='font-mono'>{title}</span>
            {summary && (
              <span className='text-muted-foreground text-sm font-normal'>
                {summary.enterprise_name}
              </span>
            )}
            {statusBadge}
          </span>
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <div className='flex flex-wrap items-center gap-2'>
            {data?.bill && <InvoiceButton bill={data.bill} size='sm' />}
            {data?.bill && (
              <BillExportCsvButton bill={data.bill} scope='admin' size='sm' />
            )}
            {data?.bill && <BillArchiveControl bill={data.bill} />}
            {data && summary && data.kind === 'period' && (
              <ExportCsvControl
                scope='admin'
                user_id={summary.user_id}
                ts_start={data.usage_ts_start}
                ts_end={data.usage_ts_end}
                filename={buildUsageCsvFilename(
                  summary.enterprise_name,
                  day(summary.period_start),
                  day(summary.period_end - 1),
                  t('statement')
                )}
              />
            )}
            <Button
              variant='outline'
              size='sm'
              render={
                <Link
                  to='/finance/$section'
                  params={{ section: 'enterprise-bills' }}
                />
              }
            >
              <ArrowLeft className='h-4 w-4' />
              {t('Back to bills')}
            </Button>
          </div>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>{content}</SectionPageLayout.Content>
      </SectionPageLayout>
      <ReconcileAckDialog
        bill={data?.bill ?? null}
        open={ackOpen}
        onOpenChange={setAckOpen}
      />
    </>
  )
}
