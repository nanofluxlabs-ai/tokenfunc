import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Progress } from '@/components/ui/progress'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

import { isTeamBudgetBlocked, type TeamBudgetView } from '../lib/team-budget'
import type { TeamBudgetState } from '../types'

const INDICATOR_CLASS: Record<TeamBudgetState, string> = {
  none: 'bg-primary',
  ok: 'bg-primary',
  warn: 'bg-warning',
  exceeded: 'bg-destructive',
}

type TeamBudgetMeterProps = {
  /** 团队列表行或概览的团队预算项 */
  team: TeamBudgetView
  /** md：团队页头用，进度条更粗、带百分比与「剩余」文字 */
  size?: 'sm' | 'md'
  /** 是否显示「已用 / 预算」金额；外层已经大号展示金额时传 false，默认 true */
  showAmount?: boolean
}

/** 团队月度预算进度：本月消耗 / 预算，达到阈值标黄、超预算标红并提示是否已拦截；未设预算不渲染 */
export function TeamBudgetMeter(props: TeamBudgetMeterProps) {
  const { t } = useTranslation()
  const { team } = props
  if (team.monthly_budget_quota <= 0) return null
  const percent = Math.min(100, Math.max(0, team.budget_percent))
  const large = props.size === 'md'
  const remaining = Math.max(0, team.monthly_budget_quota - team.month_quota)
  return (
    <div className='flex w-full flex-col gap-1'>
      <Progress
        value={percent}
        aria-label={t('Monthly budget usage')}
        className='gap-0'
        trackClassName={large ? 'bg-muted-foreground/20 h-2.5' : 'h-1'}
        indicatorClassName={INDICATOR_CLASS[team.budget_state]}
      />
      <div
        className={cn(
          'text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums',
          large ? 'text-sm' : 'text-xs'
        )}
      >
        {props.showAmount !== false && (
          <span>
            {formatQuotaWithCurrency(team.month_quota)} /{' '}
            {formatQuotaWithCurrency(team.monthly_budget_quota)}
          </span>
        )}
        {large && (
          <span>
            {percent}% · {t('Remaining')} {formatQuotaWithCurrency(remaining)}
          </span>
        )}
        {team.budget_state === 'warn' && (
          <StatusBadge
            label={t('Budget warning')}
            variant='warning'
            copyable={false}
          />
        )}
        {team.budget_state === 'exceeded' && (
          <StatusBadge
            label={t('Over budget')}
            variant='danger'
            copyable={false}
          />
        )}
        {isTeamBudgetBlocked(team) && (
          <StatusBadge
            label={t('Blocked by budget')}
            variant='danger'
            copyable={false}
          />
        )}
      </div>
    </div>
  )
}
