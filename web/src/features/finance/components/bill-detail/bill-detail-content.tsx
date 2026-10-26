import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { isBillSnapshotV2 } from '@/features/enterprise-console/types'

import { useUsageSummary } from '../../hooks/use-usage-breakdown-queries'
import type { FinanceBillContext, UsageRangeParams } from '../../types'
import { SectionBlock as Block } from '../section-block'
import { BillSnapshotSection } from '../usage-breakdown/bill-snapshot-section'
import { UsageBreakdownSection } from '../usage-breakdown/usage-breakdown-section'
import { UsageDetailTable } from '../usage-breakdown/usage-detail-table'
import { billDay } from './bill-day'
import { BillDetailMetrics, StatementBalanceBlock } from './bill-detail-metrics'
import { ReconcileDiffAlert } from './reconcile-diff-alert'
import { SnapshotGroupTable } from './snapshot-group-table'

/** 账单详情在哪一侧渲染：管理员财务中心 / 企业控制台，决定用量接口走哪个主体 */
export type BillDetailScope = 'admin' | 'enterprise'

type BillDetailContentProps = {
  context: FinanceBillContext
  scope: BillDetailScope
  /** 点击「标记已核对」：由管理员页在布局槽位外打开确认框；企业侧不传，不显示核对入口 */
  onAckReconcile?: () => void
}

/**
 * 账单详情正文：提示条 + 汇总卡 + 月结单五栏 + 用量明细 + 按团队 / 按成员归因。管理员财务中心与企业控制台共用。
 * 已出账且快照为 v2 的账单直接渲染出账时冻结的快照，不再实时扫 logs；旧账单由后端现算并标 snapshot_source=live；
 * 只剩 v1 快照（logs 已清理）的账单只能展示金额级的按模型块。进行中账期维持实时聚合。
 * 已出账账单的用量请求都带 bill_id：账期 logs 被清理且账期包有冻结件时，后端把逐条明细切到冻结件（usage_source=archive）。
 */
export function BillDetailContent(props: BillDetailContentProps) {
  const { t } = useTranslation()
  const context = props.context
  const summary = context.summary
  const bill = context.bill
  const isOpenPeriod = context.kind === 'period'
  const billSnapshot = context.kind === 'bill' ? bill?.usage_snapshot : null
  const frozen = isBillSnapshotV2(billSnapshot) ? billSnapshot : null
  const legacySnapshot =
    billSnapshot && !isBillSnapshotV2(billSnapshot) ? billSnapshot : null
  const range = {
    ts_start: context.usage_ts_start,
    ts_end: context.usage_ts_end,
  }
  const usageParams: UsageRangeParams =
    props.scope === 'admin'
      ? {
          scope: 'admin',
          user_id: summary.user_id,
          bill_id: bill?.id,
          ...range,
        }
      : { scope: 'enterprise', bill_id: bill?.id, ...range }
  const usageSource = context.usage_source ?? 'live'
  const usage = useUsageSummary({ ...usageParams, enabled: frozen === null })

  let usageBlocks: React.ReactNode
  if (frozen) {
    usageBlocks = (
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
    )
  } else if (legacySnapshot) {
    usageBlocks = (
      <>
        <Alert>
          <AlertDescription>
            {t(
              'This bill was issued before unit prices were snapshotted; price and daily breakdowns are not available.'
            )}
          </AlertDescription>
        </Alert>
        <Block title={t('Model')}>
          <SnapshotGroupTable
            title={t('Model')}
            items={legacySnapshot.by_model ?? []}
            fallbackName='—'
          />
        </Block>
        <Block title={t('Usage detail')}>
          <div className='p-2'>
            <UsageDetailTable {...usageParams} />
          </div>
        </Block>
      </>
    )
  } else {
    usageBlocks = <UsageBreakdownSection {...usageParams} />
  }

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
              { date: bill?.archived_at ? billDay(bill.archived_at) : '' }
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
      {frozen && frozen.snapshot_source !== 'live' && (
        <Alert>
          <AlertDescription>
            {t(
              'Settled bill: the breakdown below is the usage snapshot frozen at issue time.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {frozen?.snapshot_source === 'live' && (
        <Alert>
          <AlertDescription>
            {t(
              'This bill was issued before unit prices were snapshotted; the breakdown below is computed from current logs.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {bill && props.onAckReconcile && (
        <ReconcileDiffAlert bill={bill} onAck={props.onAckReconcile} />
      )}
      <BillDetailMetrics
        context={context}
        requestCount={
          frozen ? frozen.logs_total_calls : (usage.data?.total_calls ?? 0)
        }
        requestsLoading={frozen === null && usage.isLoading}
      />
      {summary.bill_type === 'statement' && billSnapshot && (
        <StatementBalanceBlock snapshot={billSnapshot} />
      )}
      {usageBlocks}
      {billSnapshot && (
        <>
          <Block title={t('Team')}>
            <SnapshotGroupTable
              title={t('Team')}
              items={billSnapshot.by_team ?? billSnapshot.by_department ?? []}
              fallbackName={t('Unassigned')}
            />
          </Block>
          <Block title={t('Member')}>
            <SnapshotGroupTable
              title={t('Member')}
              items={billSnapshot.by_member ?? billSnapshot.by_employee ?? []}
              fallbackName={t('Team key (no holder)')}
            />
          </Block>
        </>
      )}
    </div>
  )
}
