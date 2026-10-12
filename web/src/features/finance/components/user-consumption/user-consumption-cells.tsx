import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  formatCompactNumber,
  formatNumber,
  formatQuota,
  formatTimestampToDate,
} from '@/lib/format'

import { ENTERPRISE_BILLING_MODE_TAGS } from '../../constants'
import type { DayRange } from '../../lib/date-presets'
import type { FinanceUserConsumption } from '../../types'
import { MetricTooltip, type MetricTooltipItem } from '../metric-tooltip'

export function UserCell(props: {
  row: FinanceUserConsumption
  range: DayRange
}) {
  const { t } = useTranslation()
  const row = props.row
  const billingTag = row.billing_mode
    ? ENTERPRISE_BILLING_MODE_TAGS[row.billing_mode]
    : undefined
  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <Link
        to='/finance/users/$userId'
        params={{ userId: String(row.user_id) }}
        search={{
          start: props.range.start,
          end: props.range.end,
          username: row.username,
        }}
        className='text-primary truncate font-medium hover:underline'
      >
        {row.username || `#${row.user_id}`}
      </Link>
      <span className='text-muted-foreground font-mono text-xs'>
        #{row.user_id}
      </span>
      {row.is_enterprise && (
        <span className='truncate text-xs'>{row.enterprise_name}</span>
      )}
      {row.is_enterprise && billingTag && (
        <StatusBadge
          label={t(billingTag.labelKey)}
          variant={billingTag.variant}
          size='sm'
          copyable={false}
          className='-ml-1.5 w-fit'
        />
      )}
    </div>
  )
}

export function GroupCell(props: { row: FinanceUserConsumption }) {
  const { t } = useTranslation()
  const row = props.row
  let tag: { label: string; variant: 'info' | 'success' } | null = null
  if (row.current_subscription_plan_title) {
    tag = {
      label:
        row.current_subscription_source === 'admin'
          ? t('Gifted subscription')
          : t('Paid subscription'),
      variant: 'info',
    }
  } else if (row.has_successful_order) {
    tag = { label: t('Has paid order'), variant: 'success' }
  }
  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <span className='truncate'>{row.group || '-'}</span>
      {tag && (
        <StatusBadge
          label={tag.label}
          variant={tag.variant}
          size='sm'
          copyable={false}
          className='-ml-1.5 w-fit'
        />
      )}
    </div>
  )
}

/** 余额列：授信企业显示授信剩余与本期已用 / 额度；预付客户显示钱包余额与区间内钱包实扣 */
export function BalanceCell(props: { row: FinanceUserConsumption }) {
  const { t } = useTranslation()
  const row = props.row
  const period = row.billing_mode === 'credit' ? row.credit_period : undefined
  if (period) {
    const remaining = Math.max(period.limit_quota - period.used_quota, 0)
    const items: MetricTooltipItem[] = [
      { label: t('Billing mode'), value: t('Credit period') },
      {
        label: t('Current period'),
        value: `${formatTimestampToDate(period.start_at).slice(0, 10)} ~ ${formatTimestampToDate(period.end_at).slice(0, 10)}`,
      },
      { label: t('Used this period'), value: formatQuota(period.used_quota) },
      { label: t('Credit remaining'), value: formatQuota(remaining) },
      { label: t('Credit limit'), value: formatQuota(period.limit_quota) },
      { label: t('Wallet balance'), value: formatQuota(row.remain_quota) },
    ]
    return (
      <MetricTooltip items={items}>
        <span className='font-mono'>{formatQuota(remaining)}</span>
        <span className='text-muted-foreground text-xs'>
          {t('Used {{used}} / {{limit}} this period', {
            used: formatQuota(period.used_quota),
            limit: formatQuota(period.limit_quota),
          })}
        </span>
      </MetricTooltip>
    )
  }
  const items: MetricTooltipItem[] = [
    { label: t('Current balance'), value: formatQuota(row.remain_quota) },
    {
      label: t('Wallet charged'),
      value: formatQuota(row.wallet_consume_quota),
    },
    { label: t('Total quota'), value: formatQuota(row.total_quota) },
    { label: t('Used quota'), value: formatQuota(row.used_quota) },
  ]
  return (
    <MetricTooltip items={items}>
      <span className='font-mono'>{formatQuota(row.remain_quota)}</span>
      <span className='text-muted-foreground text-xs'>
        {t('Wallet charged')} {formatQuota(row.wallet_consume_quota)}
      </span>
    </MetricTooltip>
  )
}

export function ConsumptionCell(props: {
  row: FinanceUserConsumption
  locale?: string
}) {
  const { t } = useTranslation()
  const row = props.row
  const number = (value: number) => formatNumber(value, props.locale)
  const items: MetricTooltipItem[] = [
    { label: t('Net charged'), value: formatQuota(row.net_quota) },
    { label: t('Consumed'), value: formatQuota(row.consume_quota) },
    {
      label: t('From subscription'),
      value: formatQuota(row.subscription_consume_quota),
    },
    {
      label: t('Wallet charged'),
      value: formatQuota(row.wallet_consume_quota),
    },
    { label: t('Refunded'), value: formatQuota(row.refund_quota) },
    { label: t('Total tokens'), value: number(row.total_tokens) },
    { label: t('Input tokens'), value: number(row.text_input_tokens) },
    { label: t('Cache hits'), value: number(row.cache_read_tokens) },
    { label: t('Cache writes'), value: number(row.cache_write_tokens) },
    { label: t('Output tokens'), value: number(row.text_output_tokens) },
  ]
  if (row.audio_input_tokens > 0) {
    items.push({
      label: t('Audio input'),
      value: number(row.audio_input_tokens),
    })
  }
  if (row.audio_output_tokens > 0) {
    items.push({
      label: t('Audio output'),
      value: number(row.audio_output_tokens),
    })
  }
  return (
    <MetricTooltip items={items}>
      <span className='font-mono'>{formatQuota(row.net_quota)}</span>
      <span className='text-muted-foreground text-xs'>
        {formatCompactNumber(row.total_tokens, props.locale)} Tokens
      </span>
    </MetricTooltip>
  )
}
