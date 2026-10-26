import { Link } from '@tanstack/react-router'
import {
  Activity,
  CalendarRange,
  CircleDollarSign,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ChangePill } from '@/components/change-pill'
import { StatCard } from '@/features/dashboard/components/ui/stat-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import type { OverviewDailySnapshot } from '../lib/overview'

const CARD_LINK_CLASS =
  'bg-card hover:border-primary/40 focus-visible:ring-ring rounded-xl border p-3 shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none sm:p-4'

type OverviewKpiCardsProps = {
  snapshot: OverviewDailySnapshot
  loading: boolean
}

/** 概览四张 KPI：今日消耗 / 今日请求 / 今日 Token / 近 7 天消耗；底部 7 天迷你图，整卡下钻到同区间的用量报表 */
export function OverviewKpiCards(props: OverviewKpiCardsProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { today, yesterday, last7 } = props.snapshot
  const todayTokens = today.prompt_tokens + today.completion_tokens
  const todaySearch = {
    from: today.day,
    to: today.day,
    source: 'overview' as const,
  }
  const weekSearch = {
    from: last7[0]?.day ?? today.day,
    to: today.day,
    source: 'overview' as const,
  }
  const vsYesterday = t('vs yesterday')

  return (
    // 手机两列紧凑卡（迷你图隐藏），与上游控制台首页一致
    <div className='grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4'>
      <Link
        to='/enterprise/usage'
        search={todaySearch}
        className={CARD_LINK_CLASS}
        aria-label={t("Today's spend")}
      >
        <StatCard
          title={t("Today's spend")}
          value={formatQuotaWithCurrency(today.quota)}
          description={t('Yesterday {{value}}', {
            value: formatQuotaWithCurrency(yesterday.quota),
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
              previous={yesterday.quota}
              label={vsYesterday}
            />
          }
        />
      </Link>
      <Link
        to='/enterprise/usage'
        search={todaySearch}
        className={CARD_LINK_CLASS}
        aria-label={t("Today's requests")}
      >
        <StatCard
          title={t("Today's requests")}
          value={formatNumber(today.request_count, locale)}
          description={t('Yesterday {{value}}', {
            value: formatNumber(yesterday.request_count, locale),
          })}
          icon={Activity}
          tone='accent-2'
          sparkline={last7.map((day) => day.request_count)}
          sparklineVariant='line'
          loading={props.loading}
          compactMobile
          action={
            <ChangePill
              current={today.request_count}
              previous={yesterday.request_count}
              label={vsYesterday}
            />
          }
        />
      </Link>
      <Link
        to='/enterprise/usage'
        search={todaySearch}
        className={CARD_LINK_CLASS}
        aria-label={t("Today's tokens")}
      >
        <StatCard
          title={t("Today's tokens")}
          value={formatCompactNumber(todayTokens, locale)}
          description={t('Input {{input}} · Output {{output}}', {
            input: formatCompactNumber(today.prompt_tokens, locale),
            output: formatCompactNumber(today.completion_tokens, locale),
          })}
          icon={Zap}
          tone='accent-3'
          sparkline={last7.map(
            (day) => day.prompt_tokens + day.completion_tokens
          )}
          sparklineVariant='line'
          loading={props.loading}
          compactMobile
          action={
            <ChangePill
              current={todayTokens}
              previous={yesterday.prompt_tokens + yesterday.completion_tokens}
              label={vsYesterday}
            />
          }
        />
      </Link>
      <Link
        to='/enterprise/usage'
        search={weekSearch}
        className={CARD_LINK_CLASS}
        aria-label={t('Spend in the last 7 days')}
      >
        <StatCard
          title={t('Spend in the last 7 days')}
          value={formatQuotaWithCurrency(props.snapshot.last7Quota)}
          description={t('Previous 7 days {{value}}', {
            value: formatQuotaWithCurrency(props.snapshot.prev7Quota),
          })}
          icon={CalendarRange}
          tone='accent-1'
          sparkline={last7.map((day) => day.quota)}
          sparklineVariant='bars'
          loading={props.loading}
          compactMobile
          action={
            <ChangePill
              current={props.snapshot.last7Quota}
              previous={props.snapshot.prev7Quota}
              label={t('vs previous 7 days')}
            />
          }
        />
      </Link>
    </div>
  )
}
