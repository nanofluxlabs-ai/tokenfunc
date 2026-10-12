import { useTranslation } from 'react-i18next'

import { MetricCard } from '@/features/finance/components/metric-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatQuota } from '@/lib/format'

import type { ChannelUsageSummary } from '../types'

type SummaryWindow = 'range' | 'month' | 'total'

function SummaryCard(props: {
  title: string
  summary: ChannelUsageSummary | undefined
  window: SummaryWindow
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const s = props.summary
  const pick = (field: string) =>
    (s?.[`${props.window}_${field}` as keyof ChannelUsageSummary] as
      | number
      | undefined) ?? 0
  return (
    <MetricCard
      label={props.title}
      value={formatQuota(pick('official_quota'))}
      loading={props.loading}
      hint={
        <span className='flex flex-col gap-0.5'>
          <span>
            {t('{{count}} calls', {
              count: formatCompactNumber(pick('call_count'), locale),
            })}{' '}
            · {t('Actual charge')} {formatQuota(pick('quota'))}
          </span>
          <span>
            {t('Input')} {formatCompactNumber(pick('prompt_tokens'), locale)} ·{' '}
            {t('Output')}{' '}
            {formatCompactNumber(pick('completion_tokens'), locale)}
          </span>
        </span>
      }
    />
  )
}

/** 顶部三张汇总卡：所选区间 / 本月 / 累计，数字为官方价值，副行为调用与实扣 */
export function UsageSummaryCards(props: {
  summary: ChannelUsageSummary | undefined
  rangeTitle: string
  loading: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className='grid gap-3 sm:grid-cols-3'>
      <SummaryCard
        title={props.rangeTitle}
        summary={props.summary}
        window='range'
        loading={props.loading}
      />
      <SummaryCard
        title={t('This month (billing time zone)')}
        summary={props.summary}
        window='month'
        loading={props.loading}
      />
      <SummaryCard
        title={t('All time')}
        summary={props.summary}
        window='total'
        loading={props.loading}
      />
    </div>
  )
}
