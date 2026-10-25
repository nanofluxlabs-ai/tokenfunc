import { useTranslation } from 'react-i18next'

import { Progress } from '@/components/ui/progress'
import { ApiKeyQuotaCell } from '@/features/keys/components/api-key-quota-cell'
import { API_KEY_STATUS } from '@/features/keys/constants'
import type { ApiKey } from '@/features/keys/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

import {
  formatResetTime,
  TOKEN_QUOTA_RESET_PERIODS,
} from '../lib/token-quota-policy'
import type { EnterpriseToken } from '../types'

export type TokenQuotaCellProps = {
  row: EnterpriseToken
  now: number
}

/** 列表行映射成上游 ApiKey 形状，复用上游的额度单元格 */
function toApiKey(row: EnterpriseToken): ApiKey {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    // 上游额度单元格按状态灰显，这里给派生四态，余额归零 / 已到期但未回写状态的 key 也能灰显
    status: row.effective_status,
    remain_quota: row.remain_quota,
    used_quota: row.used_quota,
    unlimited_quota: row.unlimited_quota,
    expired_time: row.expired_time,
    created_time: row.created_time,
    accessed_time: row.accessed_time,
    group: row.group,
    auto_groups: null,
    cross_group_retry: false,
    model_limits_enabled: row.model_limits_enabled,
    model_limits: row.model_limits,
    allow_ips: row.allow_ips,
    allow_user_quota_query: false,
  }
}

/**
 * 企业密钥页的额度单元格：没有周期限额时直接复用上游 ApiKeyQuotaCell；
 * 有周期限额时上游「总额 = 已用 + 剩余」的口径不成立，改为「剩余 / 周期额度 · 周期」+ 下次重置时间。
 */
export function TokenQuotaCell(props: TokenQuotaCellProps) {
  const { t, i18n } = useTranslation()
  const row = props.row
  if (!row.reset_period || row.reset_period === 'never') {
    return <ApiKeyQuotaCell apiKey={toApiKey(row)} now={props.now} />
  }
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const periodQuota = row.period_quota
  const remaining = Math.max(0, row.remain_quota)
  const percentage =
    periodQuota > 0
      ? Math.min(100, Math.max(0, (remaining / periodQuota) * 100))
      : 0
  const inactive =
    row.effective_status !== API_KEY_STATUS.ENABLED || remaining <= 0
  let progressColor = 'text-emerald-500'
  if (inactive) {
    progressColor = 'text-muted-foreground/60'
  } else if (percentage <= 10) {
    progressColor = 'text-rose-500'
  } else if (percentage <= 30) {
    progressColor = 'text-amber-500'
  }
  const periodLabelKey =
    TOKEN_QUOTA_RESET_PERIODS.find(
      (period) => period.value === row.reset_period
    )?.labelKey ?? 'Custom'
  const formattedRemaining = formatQuotaWithCurrency(row.remain_quota)
  const formattedPeriod = formatQuotaWithCurrency(periodQuota, {
    showSymbol: false,
  })

  return (
    <div className='flex max-w-45 flex-col gap-1'>
      <span className='text-sm tabular-nums'>
        <span
          className={cn(
            'font-medium',
            row.remain_quota < 0 && 'text-destructive',
            row.remain_quota === 0 && 'text-muted-foreground'
          )}
        >
          {formattedRemaining}
        </span>
        <span className='text-muted-foreground'>
          {' / '}
          {formattedPeriod} · {t(periodLabelKey)}
        </span>
      </span>
      <Progress
        value={percentage}
        aria-label={t('Remaining percentage')}
        className={cn(
          'w-full [&_[data-slot=progress-indicator]]:bg-current',
          progressColor
        )}
      />
      {row.next_reset_at > 0 && (
        <span className='text-muted-foreground text-xs'>
          {t('Resets {{time}}', {
            time: formatResetTime(row.next_reset_at * 1000, locale),
          })}
        </span>
      )}
    </div>
  )
}
