import { useTranslation } from 'react-i18next'

import { MetricCard } from '@/features/finance/components/metric-card'
import { ExportCsvControl } from '@/features/finance/components/usage-breakdown/export-csv-control'
import { UsageBreakdownSection } from '@/features/finance/components/usage-breakdown/usage-breakdown-section'
import { useUsageSummary } from '@/features/finance/hooks/use-usage-breakdown-queries'
import { buildUsageCsvFilename } from '@/features/finance/lib/csv'
import { countDistinctModels } from '@/features/finance/lib/usage-breakdown'
import type { UsageRangeParams } from '@/features/finance/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

type UsageTabProps = {
  ts_start: number
  ts_end: number
  subject: string
  startDay: string
  endDay: string
}

/** 消费账单：汇总卡 + 导出 + 按令牌分组 / 按天 / 明细三块，全部复用财务中心的 self 主体 */
export function UsageTab(props: UsageTabProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const usageParams: UsageRangeParams = {
    scope: 'self',
    ts_start: props.ts_start,
    ts_end: props.ts_end,
  }
  const summary = useUsageSummary(usageParams)
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex justify-end'>
        <ExportCsvControl
          {...usageParams}
          filename={buildUsageCsvFilename(
            props.subject,
            props.startDay,
            props.endDay,
            t('usage')
          )}
        />
      </div>
      <div className='grid gap-3 sm:grid-cols-3'>
        <MetricCard
          label={t('Requests')}
          value={formatNumber(summary.data?.total_calls ?? 0, locale)}
          loading={summary.isLoading}
        />
        <MetricCard
          label={t('Total amount (USD)')}
          value={`$${Number.parseFloat(summary.data?.total_amount_usd ?? '0').toFixed(4)}`}
          loading={summary.isLoading}
        />
        <MetricCard
          label={t('Models involved')}
          value={countDistinctModels(summary.data?.by_group_model ?? [])}
          loading={summary.isLoading}
        />
      </div>
      <UsageBreakdownSection {...usageParams} />
    </div>
  )
}
