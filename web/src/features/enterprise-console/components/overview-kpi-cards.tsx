import { Link } from '@tanstack/react-router'
import { Activity, CalendarRange, CircleDollarSign, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimatedNumber } from '@/components/animated-number'
import { ChangePill } from '@/components/change-pill'
import { InteractiveSparkline } from '@/components/charts/interactive-sparkline'
import { StatCard } from '@/features/dashboard/components/ui/stat-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import type { OverviewDailySnapshot } from '../lib/overview'

const CARD_LINK_CLASS =
  'bg-card hover:border-primary/40 focus-visible:ring-ring rounded-xl border p-3 shadow-xs transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none motion-reduce:hover:translate-y-0 sm:p-4'

type OverviewKpiCardsProps = {
  snapshot: OverviewDailySnapshot
  loading: boolean
}

/** 概览四张 KPI：今日消耗 / 今日请求 / 今日 Token / 近 7 天消耗；数值入场滚动，底部 7 天迷你图可悬停看每天的值，整卡下钻到同区间的用量报表 */
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
  const formatQuota = (value: number) => formatQuotaWithCurrency(value)
  const formatCount = (value: number) => formatNumber(Math.round(value), locale)
  const formatTokens = (value: number) => formatCompactNumber(value, locale)

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
          value={<AnimatedNumber value={today.quota} format={formatQuota} />}
          description={t('Yesterday {{value}}', {
            value: formatQuotaWithCurrency(yesterday.quota),
          })}
          icon={CircleDollarSign}
          tone='accent-1'
          visualization={
            props.loading ? (
              <div className='h-8' aria-hidden='true' />
            ) : (
              <InteractiveSparkline
                points={last7.map((day) => ({
                  label: day.day.slice(5),
                  value: day.quota,
                }))}
                format={formatQuota}
                variant='line'
                tone='accent-1'
                ariaLabel={t('{{title}}, last 7 days', {
                  title: t("Today's spend"),
                })}
                focusable={false}
              />
            )
          }
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
          value={
            <AnimatedNumber value={today.request_count} format={formatCount} />
          }
          description={t('Yesterday {{value}}', {
            value: formatNumber(yesterday.request_count, locale),
          })}
          icon={Activity}
          tone='accent-2'
          visualization={
            props.loading ? (
              <div className='h-8' aria-hidden='true' />
            ) : (
              <InteractiveSparkline
                points={last7.map((day) => ({
                  label: day.day.slice(5),
                  value: day.request_count,
                }))}
                format={formatCount}
                variant='line'
                tone='accent-2'
                ariaLabel={t('{{title}}, last 7 days', {
                  title: t("Today's requests"),
                })}
                focusable={false}
              />
            )
          }
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
          value={<AnimatedNumber value={todayTokens} format={formatTokens} />}
          description={t('Input {{input}} · Output {{output}}', {
            input: formatCompactNumber(today.prompt_tokens, locale),
            output: formatCompactNumber(today.completion_tokens, locale),
          })}
          icon={Zap}
          tone='accent-3'
          visualization={
            props.loading ? (
              <div className='h-8' aria-hidden='true' />
            ) : (
              <InteractiveSparkline
                points={last7.map((day) => ({
                  label: day.day.slice(5),
                  value: day.prompt_tokens + day.completion_tokens,
                }))}
                format={formatTokens}
                variant='line'
                tone='accent-3'
                ariaLabel={t('{{title}}, last 7 days', {
                  title: t("Today's tokens"),
                })}
                focusable={false}
              />
            )
          }
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
          value={
            <AnimatedNumber
              value={props.snapshot.last7Quota}
              format={formatQuota}
            />
          }
          description={t('Previous 7 days {{value}}', {
            value: formatQuotaWithCurrency(props.snapshot.prev7Quota),
          })}
          icon={CalendarRange}
          tone='accent-1'
          visualization={
            props.loading ? (
              <div className='h-8' aria-hidden='true' />
            ) : (
              <InteractiveSparkline
                points={last7.map((day) => ({
                  label: day.day.slice(5),
                  value: day.quota,
                }))}
                format={formatQuota}
                variant='bars'
                tone='accent-1'
                ariaLabel={t('{{title}}, last 7 days', {
                  title: t('Spend in the last 7 days'),
                })}
                focusable={false}
              />
            )
          }
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
