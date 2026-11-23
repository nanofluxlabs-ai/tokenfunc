import { CalendarClock, CircleDollarSign, Gauge, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { MetricCard } from '@/features/finance/components/metric-card'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import type { KeyTokenUsage } from '../types'

const VISIBLE_MODEL_COUNT = 12

type KeySummaryProps = {
  usage?: KeyTokenUsage
  models: string[]
  loading: boolean
}

/** 额度卡片 + 可用模型；无限额度的 key 剩余与总额度显示「无限」 */
export function KeySummary(props: KeySummaryProps) {
  const { t } = useTranslation()
  const usage = props.usage
  const unlimited = usage?.unlimited_quota ?? false
  const hiddenModelCount = props.models.length - VISIBLE_MODEL_COUNT

  return (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <MetricCard
          icon={Wallet}
          label={t('Remaining quota')}
          value={
            unlimited
              ? t('Unlimited')
              : formatQuota(usage?.total_available ?? 0)
          }
          loading={props.loading}
        />
        <MetricCard
          icon={CircleDollarSign}
          label={t('Used quota')}
          value={formatQuota(usage?.total_used ?? 0)}
          loading={props.loading}
        />
        <MetricCard
          icon={Gauge}
          label={t('Total quota')}
          value={
            unlimited ? t('Unlimited') : formatQuota(usage?.total_granted ?? 0)
          }
          loading={props.loading}
        />
        <MetricCard
          icon={CalendarClock}
          label={t('Expires at')}
          value={
            usage?.expires_at
              ? formatTimestampToDate(usage.expires_at)
              : t('Never expires')
          }
          loading={props.loading}
        />
      </div>

      {usage?.user_quota && (
        <p className='text-muted-foreground text-sm'>
          {t('Account balance {{balance}}, used {{used}}', {
            balance: formatQuota(usage.user_quota.total_available),
            used: formatQuota(usage.user_quota.total_used),
          })}
        </p>
      )}

      {props.models.length > 0 && (
        <div className='flex flex-col gap-2'>
          <span className='text-muted-foreground text-sm'>
            {t('Available models')}
          </span>
          <div className='flex flex-wrap gap-1.5'>
            {props.models.slice(0, VISIBLE_MODEL_COUNT).map((model) => (
              <StatusBadge
                key={model}
                label={model}
                variant='neutral'
                size='sm'
                copyable={false}
                className='font-mono'
              />
            ))}
            {hiddenModelCount > 0 && (
              <StatusBadge
                label={t('+{{count}} more', { count: hiddenModelCount })}
                variant='neutral'
                size='sm'
                copyable={false}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
