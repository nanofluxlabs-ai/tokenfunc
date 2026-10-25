import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Progress } from '@/components/ui/progress'
import { formatQuotaWithCurrency } from '@/lib/currency'

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
}

/** 团队月度预算进度：本月消耗 / 预算，达到阈值标黄、超预算标红并提示是否已拦截；未设预算不渲染 */
export function TeamBudgetMeter(props: TeamBudgetMeterProps) {
  const { t } = useTranslation()
  const { team } = props
  if (team.monthly_budget_quota <= 0) return null
  const percent = Math.min(100, Math.max(0, team.budget_percent))
  return (
    <div className='flex w-full flex-col gap-1'>
      <Progress
        value={percent}
        aria-label={t('Monthly budget usage')}
        className='gap-0'
        trackClassName='h-1'
        indicatorClassName={INDICATOR_CLASS[team.budget_state]}
      />
      <div className='text-muted-foreground flex flex-wrap items-center gap-1 text-xs tabular-nums'>
        <span>
          {formatQuotaWithCurrency(team.month_quota)} /{' '}
          {formatQuotaWithCurrency(team.monthly_budget_quota)}
        </span>
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
