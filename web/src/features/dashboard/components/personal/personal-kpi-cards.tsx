import {
  Activity,
  CalendarRange,
  CircleDollarSign,
  type LucideIcon,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimatedNumber } from '@/components/animated-number'
import { ChangePill } from '@/components/change-pill'
import {
  InteractiveSparkline,
  type SparklineTone,
} from '@/components/charts/interactive-sparkline'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import type {
  PersonalSnapshot,
  PersonalTotals,
} from '../../lib/personal-overview'
import { StatCard } from '../ui/stat-card'

const CARD_CLASS =
  'bg-card hover:border-primary/40 rounded-xl border p-3 shadow-xs transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0 sm:p-4'

type PersonalKpiCardsProps = {
  snapshot: PersonalSnapshot
  loading: boolean
}

type KpiConfig = {
  key: keyof PersonalTotals | 'month'
  title: string
  icon: LucideIcon
  tone: SparklineTone
  current: number
  previous: number
  description: string
  compareLabel: string
  format: (value: number) => string
  /** 近 7 天迷你图取哪个指标 */
  field: keyof PersonalTotals
  variant: 'line' | 'bars'
}

/**
 * 四张 KPI：今日消耗 / 今日请求 / 今日 Token / 本月消耗。
 * 今日三项对比「昨日同一时刻」，本月对比「上月同期」，避免拿没过完的今天去比完整的昨天；
 * 数值入场滚动，底部近 7 天迷你图可悬停 / 方向键查看每天的值。
 */
export function PersonalKpiCards(props: PersonalKpiCardsProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { today, yesterdaySamePeriod, monthToDate, lastMonthSamePeriod } =
    props.snapshot
  const formatCount = (value: number) => formatNumber(Math.round(value), locale)
  const formatTokens = (value: number) => formatCompactNumber(value, locale)
  const vsYesterday = t('vs same time yesterday')

  const cards: KpiConfig[] = [
    {
      key: 'quota',
      title: t("Today's spend"),
      icon: CircleDollarSign,
      tone: 'accent-1',
      current: today.quota,
      previous: yesterdaySamePeriod.quota,
      description: t('Same time yesterday {{value}}', {
        value: formatQuotaWithCurrency(yesterdaySamePeriod.quota),
      }),
      compareLabel: vsYesterday,
      format: (value) => formatQuotaWithCurrency(value),
      field: 'quota',
      variant: 'line',
    },
    {
      key: 'count',
      title: t('Requests today'),
      icon: Activity,
      tone: 'accent-2',
      current: today.count,
      previous: yesterdaySamePeriod.count,
      description: t('Same time yesterday {{value}}', {
        value: formatCount(yesterdaySamePeriod.count),
      }),
      compareLabel: vsYesterday,
      format: formatCount,
      field: 'count',
      variant: 'line',
    },
    {
      key: 'tokens',
      title: t('Tokens today'),
      icon: Zap,
      tone: 'accent-3',
      current: today.tokens,
      previous: yesterdaySamePeriod.tokens,
      description: t('Same time yesterday {{value}}', {
        value: formatTokens(yesterdaySamePeriod.tokens),
      }),
      compareLabel: vsYesterday,
      format: formatTokens,
      field: 'tokens',
      variant: 'line',
    },
    {
      key: 'month',
      title: t('Spend this month'),
      icon: CalendarRange,
      tone: 'accent-1',
      current: monthToDate.quota,
      previous: lastMonthSamePeriod.quota,
      description: t('Same period last month {{value}}', {
        value: formatQuotaWithCurrency(lastMonthSamePeriod.quota),
      }),
      compareLabel: t('vs same period last month'),
      format: (value) => formatQuotaWithCurrency(value),
      field: 'quota',
      variant: 'bars',
    },
  ]

  return (
    <div className='grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4'>
      {cards.map((card) => (
        <div key={card.key} className={CARD_CLASS}>
          <StatCard
            title={card.title}
            value={<AnimatedNumber value={card.current} format={card.format} />}
            description={card.description}
            icon={card.icon}
            tone={card.tone}
            loading={props.loading}
            compactMobile
            action={
              <ChangePill
                current={card.current}
                previous={card.previous}
                label={card.compareLabel}
              />
            }
            visualization={
              // 数据就绪后再挂载，入场描线才作用在真实数据上
              props.loading ? (
                <div className='h-8' aria-hidden='true' />
              ) : (
                <InteractiveSparkline
                  points={props.snapshot.last7Days.map((day) => ({
                    label: day.day.slice(5),
                    value: day[card.field],
                  }))}
                  format={card.format}
                  variant={card.variant}
                  tone={card.tone}
                  ariaLabel={t('{{title}}, last 7 days', {
                    title: card.title,
                  })}
                />
              )
            }
          />
        </div>
      ))}
    </div>
  )
}
