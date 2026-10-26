import { Link } from '@tanstack/react-router'
import {
  Activity,
  CalendarRange,
  CircleDollarSign,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatCard } from '@/features/dashboard/components/ui/stat-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import { changePercent, type OverviewDailySnapshot } from '../lib/overview'

const CARD_LINK_CLASS =
  'bg-card hover:border-primary/40 focus-visible:ring-ring rounded-xl border p-4 shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none'

type OverviewKpiCardsProps = {
  snapshot: OverviewDailySnapshot
  loading: boolean
}

/** 环比徽标：上期为 0 时不显示；涨跌只表示方向，不代表好坏，统一用中性色 */
function ChangePill(props: {
  current: number
  previous: number
  label: string
}) {
  const delta = changePercent(props.current, props.previous)
  if (delta === null) return null
  const Icon = delta >= 0 ? TrendingUp : TrendingDown
  const sign = delta >= 0 ? '+' : ''
  return (
    <span
      className='bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums'
      title={props.label}
    >
      <Icon className='size-3' aria-hidden='true' />
      {`${sign}${delta}%`}
      <span className='sr-only'>{props.label}</span>
    </span>
  )
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
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
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
