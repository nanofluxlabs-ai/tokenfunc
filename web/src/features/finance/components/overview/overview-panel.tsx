import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  CircleDollarSign,
  Coins,
  Repeat,
  ShoppingCart,
  UserCheck,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getFinanceOverview } from '../../api'
import { FINANCE_QUERY_KEY } from '../../constants'
import type { DayRange } from '../../lib/date-presets'
import { formatMoney } from '../../lib/order-display'
import type { FinanceDailyStats, FinanceDisplayCurrency } from '../../types'
import { MetricCard } from '../metric-card'
import { DailyTable } from './daily-table'

type OverviewPanelProps = { range: DayRange }

export function OverviewPanel(props: OverviewPanelProps) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: [
      FINANCE_QUERY_KEY,
      'overview',
      props.range.start,
      props.range.end,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getFinanceOverview({
          start_date: props.range.start,
          end_date: props.range.end,
        })
      ).data ?? null,
  })
  const currency: FinanceDisplayCurrency = data?.display_currency ?? 'USD'
  const summary: FinanceDailyStats | undefined = data?.summary
  const money = (value: number | undefined) =>
    value == null ? '-' : formatMoney(value, currency)
  const quota = (value: number | undefined) =>
    value == null ? '-' : formatQuota(value)
  const count = (value: number | undefined) => value ?? '-'

  // 图标色按指标类别区分：用户 chart-1（绿）、订单与收入 chart-4（蓝）、消耗 chart-5（橙）；品牌预设的 chart-2 / 3 是黑白灰
  const cards = [
    {
      label: t('New registrations'),
      value: count(summary?.new_users),
      icon: UserPlus,
      tone: 'chart-1',
    },
    {
      label: t('New paying users'),
      value: count(summary?.new_paid_users),
      icon: UserCheck,
      tone: 'chart-1',
    },
    {
      label: t('Successful orders'),
      value: count(summary?.paid_order_count),
      icon: ShoppingCart,
      tone: 'chart-4',
    },
    {
      label: t('Order amount'),
      value: money(summary?.paid_amount),
      icon: CircleDollarSign,
      tone: 'chart-4',
    },
    {
      label: t('Top-up amount'),
      value: money(summary?.wallet_amount),
      icon: Wallet,
      tone: 'chart-4',
    },
    {
      label: t('Subscription amount'),
      value: money(summary?.subscription_amount),
      icon: Repeat,
      tone: 'chart-4',
    },
    {
      label: t('All-user consumption'),
      value: quota(summary?.all_user_consume_quota),
      icon: Activity,
      tone: 'chart-5',
    },
    {
      label: t('Paying-user consumption'),
      value: quota(summary?.paid_user_consume_quota),
      icon: Coins,
      tone: 'chart-5',
    },
  ] as const

  return (
    <div className='flex flex-col gap-4'>
      {data && !data.log_consume_enabled && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              'Consumption logging is disabled, so consumption figures only cover periods when it was on.'
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {cards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            iconTone={card.tone}
            loading={isLoading}
          />
        ))}
      </div>
      <DailyTable
        rows={data?.daily ?? []}
        currency={currency}
        isLoading={isLoading}
        rangeLabel={`${props.range.start} ~ ${props.range.end}`}
      />
    </div>
  )
}
