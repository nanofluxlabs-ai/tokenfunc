import { useTranslation } from 'react-i18next'

import {
  usageScopeOf,
  useUsageDaily,
  useUsageSummary,
} from '../../hooks/use-usage-breakdown-queries'
import type { UsageRangeParams, UsageSummary } from '../../types'
import { SectionBlock as Block } from '../section-block'
import { DailySummaryTable } from './daily-summary-table'
import { TokenGroupSummaryTable } from './token-group-summary-table'
import { UsageDetailTable } from './usage-detail-table'

type UsageBreakdownSectionProps = UsageRangeParams & {
  /** 汇总加载完成后回调（详情页用它算汇总卡） */
  onSummary?: (summary: UsageSummary | null) => void
}

/** 用量明细三块：按令牌分组汇总、按天汇总、消费明细；用户消耗详情页与账单详情页共用 */
export function UsageBreakdownSection(props: UsageBreakdownSectionProps) {
  const { t } = useTranslation()
  const summary = useUsageSummary(props)
  const daily = useUsageDaily(props)
  return (
    <div className='flex flex-col gap-4'>
      <Block title={t('Summary by token group')}>
        <TokenGroupSummaryTable
          rows={summary.data?.by_group_model ?? []}
          totalQuota={summary.data?.total_quota ?? 0}
          isLoading={summary.isLoading}
        />
      </Block>
      <Block title={t('Summary by day')}>
        <DailySummaryTable
          rows={daily.data?.by_day ?? []}
          isLoading={daily.isLoading}
        />
      </Block>
      <Block title={t('Usage detail')}>
        <div className='p-2'>
          <UsageDetailTable
            {...usageScopeOf(props)}
            ts_start={props.ts_start}
            ts_end={props.ts_end}
          />
        </div>
      </Block>
    </div>
  )
}
