import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import type { BillUsageSnapshotV2 } from '@/features/enterprise-console/types'

import { SectionBlock as Block } from '../section-block'
import { DailySummaryTable } from './daily-summary-table'
import { TokenGroupSummaryTable } from './token-group-summary-table'

type BillSnapshotSectionProps = {
  snapshot: BillUsageSnapshotV2
  /** 账单金额（账期计数器），与快照里的 logs 合计不等时提示在途尾差 */
  amountQuota: number
}

/** 已结算账单的用量明细：直接渲染出账时冻结的快照 v2（按令牌分组汇总 + 按天），企业控制台与管理员财务中心共用 */
export function BillSnapshotSection(props: BillSnapshotSectionProps) {
  const { t } = useTranslation()
  const snapshot = props.snapshot
  return (
    <div className='flex flex-col gap-4'>
      {snapshot.logs_total_quota !== props.amountQuota && (
        <Alert className='border-warning/40 bg-warning/10'>
          <AlertDescription>
            {t(
              'The breakdown below comes from request logs; it may differ from the billed amount by requests still in flight when the period closed.'
            )}
          </AlertDescription>
        </Alert>
      )}
      <Block title={t('Summary by token group')}>
        <TokenGroupSummaryTable
          rows={snapshot.by_group_model}
          totalQuota={snapshot.logs_total_quota}
        />
      </Block>
      <Block title={t('Summary by day')}>
        <DailySummaryTable rows={snapshot.by_day} />
      </Block>
    </div>
  )
}
