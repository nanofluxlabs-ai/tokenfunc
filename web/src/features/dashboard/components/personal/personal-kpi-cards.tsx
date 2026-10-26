import { Activity, CalendarRange, CircleDollarSign, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ChangePill } from '@/components/change-pill'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import type { PersonalSnapshot } from '../../lib/personal-overview'
import { StatCard } from '../ui/stat-card'

const CARD_CLASS = 'bg-card rounded-xl border p-3 shadow-xs sm:p-4'

type PersonalKpiCardsProps = {
  snapshot: PersonalSnapshot
  loading: boolean
}

/**
 * 四张 KPI：今日消耗 / 今日请求 / 今日 Token / 本月消耗。
 * 今日三项对比「昨日同一时刻」，本月对比「上月同期」，避免拿没过完的今天去比完整的昨天；底部为近 7 天迷你图。
 */
export function PersonalKpiCards(props: PersonalKpiCardsProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { today, yesterdaySamePeriod, monthToDate, lastMonthSamePeriod } =
    props.snapshot
  const last7 = props.snapshot.last7Days
  const vsYesterday = t('vs same time yesterday')

  return (
    <div className='grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4'>
      <div className={CARD_CLASS}>
        <StatCard
          title={t("Today's spend")}
          value={formatQuotaWithCurrency(today.quota)}
          description={t('Same time yesterday {{value}}', {
            value: formatQuotaWithCurrency(yesterdaySamePeriod.quota),
          })}
          icon={CircleDollarSign}
          tone='accent-1'
          sparkline={last7.map((day) => day.quota)}
          sparklineVariant='line'
          loading={props.loading}
          compactMobile
          action={
            <ChangePill
              current={today.quota}
              previous={yesterdaySamePeriod.quota}
              label={vsYesterday}
            />
          }
        />
      </div>
      <div className={CARD_CLASS}>
        <StatCard
          title={t('Requests today')}
          value={formatNumber(today.count, locale)}
          description={t('Same time yesterday {{value}}', {
            value: formatNumber(yesterdaySamePeriod.count, locale),
          })}
          icon={Activity}
          tone='accent-2'
          sparkline={last7.map((day) => day.count)}
          sparklineVariant='line'
          loading={props.loading}
          compactMobile
          action={
            <ChangePill
              current={today.count}
              previous={yesterdaySamePeriod.count}
              label={vsYesterday}
            />
          }
        />
      </div>
      <div className={CARD_CLASS}>
        <StatCard
          title={t('Tokens today')}
          value={formatCompactNumber(today.tokens, locale)}
          description={t('Same time yesterday {{value}}', {
            value: formatCompactNumber(yesterdaySamePeriod.tokens, locale),
          })}
          icon={Zap}
          tone='accent-3'
          sparkline={last7.map((day) => day.tokens)}
          sparklineVariant='line'
          loading={props.loading}
          compactMobile
          action={
            <ChangePill
              current={today.tokens}
              previous={yesterdaySamePeriod.tokens}
              label={vsYesterday}
            />
          }
        />
      </div>
      <div className={CARD_CLASS}>
        <StatCard
          title={t('Spend this month')}
          value={formatQuotaWithCurrency(monthToDate.quota)}
          description={t('Same period last month {{value}}', {
            value: formatQuotaWithCurrency(lastMonthSamePeriod.quota),
          })}
          icon={CalendarRange}
          tone='accent-1'
          sparkline={last7.map((day) => day.quota)}
          sparklineVariant='bars'
          loading={props.loading}
          compactMobile
          action={
            <ChangePill
              current={monthToDate.quota}
              previous={lastMonthSamePeriod.quota}
              label={t('vs same period last month')}
            />
          }
        />
      </div>
    </div>
  )
}
