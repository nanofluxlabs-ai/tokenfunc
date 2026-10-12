import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  MetricTooltip,
  type MetricTooltipItem,
} from '@/features/finance/components/metric-tooltip'
import { ENTERPRISE_BILLING_MODE_TAGS } from '@/features/finance/constants'
import type { DayRange } from '@/features/finance/lib/date-presets'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota, formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { RUNWAY_DANGER_DAYS, RUNWAY_WARN_DAYS } from '../constants'
import {
  estimateRunwayDays,
  formatShare,
  metricValue,
  sharePercent,
} from '../lib/usage-metrics'
import type {
  ChannelBreakdownPayer,
  ChannelUsageAmount,
  ChannelUsageMetric,
} from '../types'

/** 金额单元：主数字 = 所选口径，副行 = 另一口径 + 占比，下方占比条 */
export function AmountCell(props: {
  amount: ChannelUsageAmount
  metric: ChannelUsageMetric
  total: number
}) {
  const { t } = useTranslation()
  const primary = metricValue(props.amount, props.metric)
  const secondaryLabel =
    props.metric === 'actual'
      ? `${t('Official price')} ${formatQuota(props.amount.official_quota || 0)}`
      : `${t('Actual charge')} ${formatQuota(props.amount.quota || 0)}`
  const percent = sharePercent(primary, props.total)
  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <span className='font-mono text-sm font-semibold tabular-nums'>
        {formatQuota(primary)}
      </span>
      <span className='text-muted-foreground truncate text-xs'>
        {secondaryLabel} · {formatShare(primary, props.total)}
      </span>
      <Progress
        value={percent}
        aria-label={formatShare(primary, props.total)}
        trackClassName='h-1'
      />
    </div>
  )
}

/** 悬浮查看一组用量（官方价 / 实扣 / 调用 / 输入 / 输出） */
export function UsageTooltip(props: {
  amount: ChannelUsageAmount
  children: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const items: MetricTooltipItem[] = [
    {
      label: t('Official price'),
      value: formatQuota(props.amount.official_quota || 0),
    },
    { label: t('Actual charge'), value: formatQuota(props.amount.quota || 0) },
    {
      label: t('Calls'),
      value: formatNumber(props.amount.call_count || 0, locale),
    },
    {
      label: t('Input tokens'),
      value: formatNumber(props.amount.prompt_tokens || 0, locale),
    },
    {
      label: t('Output tokens'),
      value: formatNumber(props.amount.completion_tokens || 0, locale),
    },
  ]
  return <MetricTooltip items={items}>{props.children}</MetricTooltip>
}

/** 余额单元，口径同财务中心「用户消耗」：预付看钱包余额；授信企业看当前账期剩余与本期已用 */
export function PayerBalanceCell(props: { payer: ChannelBreakdownPayer }) {
  const { t } = useTranslation()
  const payer = props.payer
  if (!payer.payer_id) {
    return <span className='text-muted-foreground text-xs'>-</span>
  }
  const period =
    payer.billing_mode === 'credit' ? payer.credit_period : undefined
  if (payer.billing_mode === 'credit') {
    const modeTag = ENTERPRISE_BILLING_MODE_TAGS.credit
    if (!period) {
      return (
        <div className='flex flex-col items-start gap-1'>
          <StatusBadge
            label={t(modeTag.labelKey)}
            variant={modeTag.variant}
            size='sm'
            copyable={false}
          />
          <span className='text-muted-foreground text-xs'>
            {t('No open credit period')}
          </span>
        </div>
      )
    }
    const remaining = Math.max(period.limit_quota - period.used_quota, 0)
    const usedRatio =
      period.limit_quota > 0 ? period.used_quota / period.limit_quota : 0
    const items: MetricTooltipItem[] = [
      { label: t('Billing mode'), value: t('Credit period') },
      {
        label: t('Current period'),
        value: `${formatTimestampToDate(period.start_at).slice(0, 10)} ~ ${formatTimestampToDate(period.end_at).slice(0, 10)}`,
      },
      { label: t('Used this period'), value: formatQuota(period.used_quota) },
      { label: t('Credit remaining'), value: formatQuota(remaining) },
      { label: t('Credit limit'), value: formatQuota(period.limit_quota) },
      { label: t('Wallet balance'), value: formatQuota(payer.remain_quota) },
    ]
    return (
      <MetricTooltip items={items}>
        <span className='flex flex-wrap items-center justify-end gap-1'>
          <StatusBadge
            label={t(modeTag.labelKey)}
            variant={modeTag.variant}
            size='sm'
            copyable={false}
          />
          <span className='font-mono text-sm'>
            {t('Remaining')} {formatQuota(remaining)}
          </span>
        </span>
        <span
          className={cn(
            'text-xs',
            usedRatio >= 0.9 && 'text-destructive',
            usedRatio >= 0.7 && usedRatio < 0.9 && 'text-warning',
            usedRatio < 0.7 && 'text-muted-foreground'
          )}
        >
          {t('Used {{used}} / {{limit}} this period', {
            used: formatQuota(period.used_quota),
            limit: formatQuota(period.limit_quota),
          })}
          {period.limit_quota > 0 ? ` (${Math.round(usedRatio * 100)}%)` : ''}
        </span>
      </MetricTooltip>
    )
  }

  const runway = estimateRunwayDays(payer.remain_quota, payer.avg_daily_consume)
  let runwayNode: ReactNode = null
  if (payer.has_subscription) {
    runwayNode = (
      <span className='text-success text-xs'>{t('Active subscription')}</span>
    )
  } else if (payer.avg_daily_consume > 0 && payer.remain_quota <= 0) {
    runwayNode = (
      <span className='text-destructive text-xs'>{t('Balance exhausted')}</span>
    )
  } else if (runway !== null && runway < RUNWAY_WARN_DAYS) {
    runwayNode = (
      <span
        className={cn(
          'text-xs',
          runway < RUNWAY_DANGER_DAYS ? 'text-destructive' : 'text-warning'
        )}
      >
        {t('About {{days}} days left', {
          days: runway < 1 ? '<1' : Math.floor(runway),
        })}
      </span>
    )
  }
  const items: MetricTooltipItem[] = [
    { label: t('Billing mode'), value: t('Prepaid') },
    { label: t('Current balance'), value: formatQuota(payer.remain_quota) },
  ]
  if (payer.avg_daily_consume > 0) {
    items.push({
      label: t('Average daily spend (7 days)'),
      value: formatQuota(payer.avg_daily_consume),
    })
  }
  if (payer.has_subscription) {
    items.push({ label: t('Subscription'), value: t('Active subscription') })
  }
  return (
    <MetricTooltip items={items}>
      <span className='font-mono text-sm'>
        {t('Balance')} {formatQuota(payer.remain_quota)}
      </span>
      {runwayNode}
    </MetricTooltip>
  )
}

/** 付款主体名称：企业优先显示企业名，点击进入财务中心用户消耗详情；系统请求不可点 */
export function PayerNameCell(props: {
  payer: ChannelBreakdownPayer
  range: DayRange
}) {
  const { t } = useTranslation()
  const payer = props.payer
  if (!payer.payer_id) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className='flex cursor-help flex-col' />}>
          <span className='font-medium'>{t('System requests')}</span>
          <span className='text-muted-foreground text-xs'>user_id = 0</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('Requests without a user, such as channel tests')}</p>
        </TooltipContent>
      </Tooltip>
    )
  }
  const title = (payer.is_enterprise && payer.enterprise_name) || payer.username
  const subParts: string[] = []
  if (title !== payer.username && payer.username) subParts.push(payer.username)
  subParts.push(`#${payer.payer_id}`)
  return (
    <div className='flex min-w-0 flex-col'>
      <Link
        to='/finance/users/$userId'
        params={{ userId: String(payer.payer_id) }}
        search={{
          start: props.range.start,
          end: props.range.end,
          username: payer.username,
        }}
        className='text-primary truncate font-medium hover:underline'
        title={t('View consumption details')}
        onClick={(event) => event.stopPropagation()}
      >
        {title}
      </Link>
      <span className='text-muted-foreground truncate font-mono text-xs'>
        {subParts.join(' · ')}
      </span>
      {payer.status === 2 && (
        <StatusBadge
          label={t('Disabled')}
          variant='danger'
          size='sm'
          copyable={false}
          className='mt-0.5 -ml-1.5 w-fit'
        />
      )}
    </div>
  )
}

export function RankBadge(props: { rank: number }) {
  return (
    <span className='text-muted-foreground w-4 shrink-0 text-xs font-semibold tabular-nums'>
      {props.rank}
    </span>
  )
}

/** 「其余 N 个 … 合计」脚注 */
export function OthersFooter(props: {
  count: number
  amount: ChannelUsageAmount
  total: ChannelUsageAmount
  metric: ChannelUsageMetric
  text: (count: number, amount: string, share: string) => string
}) {
  if (props.count <= 0) return null
  const value = metricValue(props.amount, props.metric)
  return (
    <div className='text-muted-foreground border-t border-dashed pt-2 text-xs'>
      {props.text(
        props.count,
        formatQuota(value),
        formatShare(value, metricValue(props.total, props.metric))
      )}
    </div>
  )
}
