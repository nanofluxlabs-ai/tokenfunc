import { Link } from '@tanstack/react-router'
import { BarChart3, KeyRound, ReceiptText, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  formatCreditPeriodRange,
  isCreditAwaitingPayment,
} from '../lib/credit-period'
import type { EnterpriseOverview } from '../types'
import { CreditAlertHint } from './credit-alert-hint'
import { TeamBudgetMeter } from './team-budget-meter'

type OverviewHeroProps = {
  overview: EnterpriseOverview
  /** 团队角色：账户区换成本团队本月消耗 / 预算，按钮不含财务对账 */
  teamScoped: boolean
  /** 预付企业最近一笔充值时间（没有则 null） */
  lastTopupAt?: number | null
  refreshing: boolean
  onRefresh: () => void
}

/** 概览顶部账户卡：授信看剩余额度与本期进度，预付看余额，团队角色看本团队预算；右上角刷新 */
export function OverviewHero(props: OverviewHeroProps) {
  const { t } = useTranslation()
  const enterprise = props.overview.enterprise
  const isCredit = enterprise.billing_mode === 'credit'

  let account: ReactNode
  if (props.teamScoped) {
    account = <TeamAccount overview={props.overview} />
  } else if (isCredit) {
    account = <CreditAccount overview={props.overview} />
  } else {
    account = (
      <PrepaidAccount
        overview={props.overview}
        lastTopupAt={props.lastTopupAt}
      />
    )
  }

  return (
    <Card
      className={cn(
        'relative gap-0 overflow-hidden p-5 sm:p-6',
        'bg-[linear-gradient(135deg,color-mix(in_oklch,var(--chart-1)_10%,var(--card))_0%,var(--card)_55%,color-mix(in_oklch,var(--chart-4)_6%,var(--card))_100%)]'
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <span className='truncate text-sm font-medium'>
            {enterprise.name}
          </span>
          {!props.teamScoped && (
            <StatusBadge
              label={isCredit ? t('Credit') : t('Prepaid')}
              variant={isCredit ? 'info' : 'neutral'}
              copyable={false}
            />
          )}
          {enterprise.status === 'suspended' && (
            <StatusBadge
              label={t('Suspended')}
              variant='danger'
              copyable={false}
            />
          )}
        </div>
        <Button
          variant='ghost'
          size='icon'
          aria-label={t('Refresh')}
          disabled={props.refreshing}
          onClick={props.onRefresh}
        >
          <RefreshCw
            className={cn('size-4', props.refreshing && 'animate-spin')}
            aria-hidden='true'
          />
        </Button>
      </div>

      <div className='mt-3'>{account}</div>

      <div className='mt-5 flex flex-wrap gap-2'>
        {!props.teamScoped && (
          <Button render={<Link to='/enterprise/bills' search={{}} />}>
            <ReceiptText className='size-4' aria-hidden='true' />
            {t('View reconciliation')}
          </Button>
        )}
        <Button
          variant={props.teamScoped ? 'default' : 'outline'}
          render={
            <Link to='/enterprise/usage' search={{ source: 'overview' }} />
          }
        >
          <BarChart3 className='size-4' aria-hidden='true' />
          {t('Usage Report')}
        </Button>
        {props.teamScoped && (
          <Button
            variant='outline'
            render={<Link to='/enterprise/keys' search={{}} />}
          >
            <KeyRound className='size-4' aria-hidden='true' />
            {t('API Keys')}
          </Button>
        )}
      </div>
    </Card>
  )
}

/** 大号金额 + 可选分母 */
function HeroAmount(props: { label: string; value: string; total?: string }) {
  return (
    <div>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-1 flex flex-wrap items-baseline gap-x-1.5 font-mono'>
        <span className='text-2xl font-semibold tracking-tight break-all sm:text-4xl'>
          {props.value}
        </span>
        {props.total && (
          <span className='text-muted-foreground text-base'>
            / {props.total}
          </span>
        )}
      </div>
    </div>
  )
}

function CreditAccount(props: { overview: EnterpriseOverview }) {
  const { t } = useTranslation()
  const enterprise = props.overview.enterprise
  const period = props.overview.open_period
  if (!period) {
    return (
      <div className='flex flex-col gap-2'>
        <HeroAmount
          label={t('Remaining credit')}
          value='—'
          total={formatQuotaWithCurrency(enterprise.credit_limit_quota)}
        />
        <div className='text-muted-foreground text-xs'>
          {isCreditAwaitingPayment(enterprise, false) ? (
            <StatusBadge
              label={t('Awaiting payment')}
              variant='warning'
              copyable={false}
            />
          ) : (
            t('No open credit period')
          )}
        </div>
      </div>
    )
  }
  const usedPercent =
    period.limit_quota > 0 ? (period.used_quota / period.limit_quota) * 100 : 0
  const remaining = Math.max(0, period.limit_quota - period.used_quota)
  return (
    <div className='flex flex-col gap-3'>
      <HeroAmount
        label={t('Remaining credit')}
        value={formatQuotaWithCurrency(remaining)}
        total={formatQuotaWithCurrency(period.limit_quota)}
      />
      <div className='max-w-xl'>
        <Progress
          value={Math.min(100, usedPercent)}
          aria-label={t('Current period usage')}
        />
        <div className='text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs'>
          <span>
            {t('Current period usage')}{' '}
            <span className='text-foreground font-mono'>
              {formatQuotaWithCurrency(period.used_quota)}
            </span>{' '}
            ({usedPercent.toFixed(1)}%)
          </span>
          <span>
            {t('Period #{{no}} · {{range}}', {
              no: period.period_no,
              range: formatCreditPeriodRange(period, formatTimestampToDate),
            })}
          </span>
        </div>
        <CreditAlertHint
          alertPercent={enterprise.credit_alert_percent}
          usedPercent={usedPercent}
        />
      </div>
    </div>
  )
}

function PrepaidAccount(props: {
  overview: EnterpriseOverview
  lastTopupAt?: number | null
}) {
  const { t } = useTranslation()
  let topupHint = t('No top-ups yet')
  if (props.lastTopupAt) {
    topupHint = t('Last top-up {{date}}', {
      date: formatTimestampToDate(props.lastTopupAt),
    })
  }
  return (
    <div className='flex flex-col gap-2'>
      <HeroAmount
        label={t('Balance')}
        value={formatQuotaWithCurrency(props.overview.balance_quota)}
      />
      <div className='text-muted-foreground text-xs'>{topupHint}</div>
    </div>
  )
}

function TeamAccount(props: { overview: EnterpriseOverview }) {
  const { t } = useTranslation()
  const budget = props.overview.team_budget
  return (
    <div className='flex flex-col gap-2'>
      <HeroAmount
        label={t('Team spend this month')}
        value={formatQuotaWithCurrency(props.overview.month.quota)}
        total={
          budget ? formatQuotaWithCurrency(budget.budget_quota) : undefined
        }
      />
      <div className='text-muted-foreground max-w-xl text-xs'>
        {budget ? (
          <TeamBudgetMeter
            size='md'
            showAmount={false}
            team={{
              monthly_budget_quota: budget.budget_quota,
              month_quota: budget.month_quota,
              budget_percent: budget.budget_percent,
              budget_state: budget.budget_state,
              budget_enforce: budget.budget_enforce,
            }}
          />
        ) : (
          t('No budget set')
        )}
      </div>
    </div>
  )
}
