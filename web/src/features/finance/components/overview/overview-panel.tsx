import { useQuery } from '@tanstack/react-query'
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

  const cards = [
    { label: t('New registrations'), value: count(summary?.new_users) },
    { label: t('New paying users'), value: count(summary?.new_paid_users) },
    { label: t('Successful orders'), value: count(summary?.paid_order_count) },
    { label: t('Order amount'), value: money(summary?.paid_amount) },
    { label: t('Top-up amount'), value: money(summary?.wallet_amount) },
    {
      label: t('Subscription amount'),
      value: money(summary?.subscription_amount),
    },
    {
      label: t('All-user consumption'),
      value: quota(summary?.all_user_consume_quota),
    },
    {
      label: t('Paying-user consumption'),
      value: quota(summary?.paid_user_consume_quota),
    },
  ]

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
