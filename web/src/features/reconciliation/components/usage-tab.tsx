import { useTranslation } from 'react-i18next'

import { MetricCard } from '@/features/finance/components/metric-card'
import { UsageBreakdownSection } from '@/features/finance/components/usage-breakdown/usage-breakdown-section'
import { useUsageSummary } from '@/features/finance/hooks/use-usage-breakdown-queries'
import { countDistinctModels } from '@/features/finance/lib/usage-breakdown'
import type { UsageRangeParams } from '@/features/finance/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

type UsageTabProps = { usageParams: UsageRangeParams }

/** 消费账单：汇总卡 + 按令牌分组 / 按天 / 明细三块，复用财务中心的 self 主体；导出控件在页面 tab 行 */
export function UsageTab(props: UsageTabProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const summary = useUsageSummary(props.usageParams)
  return (
    <div className='flex flex-col gap-4'>
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
      <UsageBreakdownSection {...props.usageParams} />
    </div>
  )
}
