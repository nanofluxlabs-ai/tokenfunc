import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { MetricCard } from '@/features/finance/components/metric-card'
import { SectionBlock } from '@/features/finance/components/section-block'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { useTopupSummary } from '../hooks/use-topup-queries'
import { formatSignedUsd } from '../lib/topup-display'
import { TopupDetailTable } from './topup-detail-table'
import { TopupSourceTable } from './topup-source-table'

type TopupTabProps = { ts_start: number; ts_end: number }

/** 充值账单：汇总卡 + 口径说明 + 按来源汇总 + 充值明细；导出按钮在页面 tab 行 */
export function TopupTab(props: TopupTabProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const summary = useTopupSummary(props)

  return (
    <div className='flex flex-col gap-4'>
      <div className='grid gap-3 sm:grid-cols-3'>
        <MetricCard
          label={t('Entries')}
          value={formatNumber(summary.data?.total_entries ?? 0, locale)}
          loading={summary.isLoading}
        />
        <MetricCard
          label={t('Net amount (USD)')}
          value={formatSignedUsd(summary.data?.total_amount_usd ?? '0.000000')}
          loading={summary.isLoading}
        />
        <MetricCard
          label={t('Sources')}
          value={summary.data?.by_source.length ?? 0}
          loading={summary.isLoading}
        />
      </div>
      <Alert className='bg-muted/40'>
        <AlertDescription>
          {t(
            'Wallet entries are the non-consumption movements of your wallet: online top-ups, redemption codes, enterprise offline top-ups, admin adjustments, refunds and subscriptions paid by balance. Subscriptions paid online do not change the wallet.'
          )}
        </AlertDescription>
      </Alert>
      <SectionBlock title={t('Summary by source')}>
        <TopupSourceTable
          rows={summary.data?.by_source ?? []}
          isLoading={summary.isLoading}
        />
      </SectionBlock>
      <SectionBlock title={t('Wallet entries')}>
        <div className='p-2'>
          <TopupDetailTable ts_start={props.ts_start} ts_end={props.ts_end} />
        </div>
      </SectionBlock>
    </div>
  )
}
