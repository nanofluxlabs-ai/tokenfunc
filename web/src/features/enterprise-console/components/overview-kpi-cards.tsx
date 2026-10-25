import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'

import {
  formatCreditPeriodRange,
  isCreditAwaitingPayment,
} from '../lib/credit-period'
import { monthOverMonthPercent } from '../lib/overview'
import type { EnterpriseOverview } from '../types'
import { CreditAlertHint } from './credit-alert-hint'
import { TeamBudgetMeter } from './team-budget-meter'

const LINK_CLASS =
  'text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs'

type OverviewKpiCardsProps = {
  overview: EnterpriseOverview
  /** 团队角色：第一张卡换成本团队本月消耗 / 预算，第四张只数本团队成员 */
  teamScoped: boolean
  /** 预付企业最近一笔充值时间（没有则 null）；授信 / 团队角色不传 */
  lastTopupAt?: number | null
}

/** 概览四张 KPI 卡：本期 / 本月 / 密钥 / 组织，每张都是对应页面的深链 */
export function OverviewKpiCards(props: OverviewKpiCardsProps) {
  const { t } = useTranslation()
  const { overview } = props
  const monthDelta = monthOverMonthPercent(
    overview.month.quota,
    overview.month.prev_quota
  )
  let monthHint = t('Last month {{amount}}', {
    amount: formatQuotaWithCurrency(overview.month.prev_quota),
  })
  if (monthDelta !== null) {
    const sign = monthDelta >= 0 ? '+' : ''
    monthHint = `${t('{{delta}} vs last month', { delta: `${sign}${monthDelta}%` })} · ${monthHint}`
  }
  const expiringHint =
    overview.keys.expiring_7d > 0
      ? t('{{count}} key(s) expire within 7 days', {
          count: overview.keys.expiring_7d,
        })
      : t('No keys expiring within 7 days')

  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
      {props.teamScoped ? (
        <TeamSpendCard overview={overview} />
      ) : (
        <BillingCard overview={overview} lastTopupAt={props.lastTopupAt} />
      )}
      <Card>
        <CardHeader>
          <CardDescription>{t('Spend this month')}</CardDescription>
          <CardTitle className='font-mono text-xl'>
            {formatQuotaWithCurrency(overview.month.quota)}
          </CardTitle>
          <CardAction>
            <Link to='/enterprise/usage' className={LINK_CLASS}>
              {t('Usage Report')}
              <ArrowRight className='size-3' aria-hidden='true' />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className='text-muted-foreground text-xs'>
          {monthHint}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>{t('Active keys')}</CardDescription>
          <CardTitle className='font-mono text-xl'>
            {overview.keys.active}
            <span className='text-muted-foreground text-base font-normal'>
              {' / '}
              {overview.keys.total}
            </span>
          </CardTitle>
          <CardAction>
            <Link to='/enterprise/keys' search={{}} className={LINK_CLASS}>
              {t('API Keys')}
              <ArrowRight className='size-3' aria-hidden='true' />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className='text-muted-foreground text-xs'>
          {expiringHint}
        </CardContent>
      </Card>
      <OrgCard overview={overview} teamScoped={props.teamScoped} />
    </div>
  )
}

/** 企业视角第一张卡：授信显示本期已用 / 额度与预警，预付显示余额与最近充值 */
function BillingCard(props: {
  overview: EnterpriseOverview
  lastTopupAt?: number | null
}) {
  const { t } = useTranslation()
  const { overview } = props
  const enterprise = overview.enterprise
  const suspended = enterprise.status === 'suspended' && (
    <StatusBadge label={t('Suspended')} variant='danger' copyable={false} />
  )
  if (enterprise.billing_mode !== 'credit') {
    let topupHint = t('No top-ups yet')
    if (props.lastTopupAt) {
      topupHint = t('Last top-up {{date}}', {
        date: formatTimestampToDate(props.lastTopupAt),
      })
    }
    return (
      <Card>
        <CardHeader>
          <CardDescription>{t('Balance')}</CardDescription>
          <CardTitle className='flex items-center gap-2 font-mono text-xl'>
            {formatQuotaWithCurrency(overview.balance_quota)}
            {suspended}
          </CardTitle>
        </CardHeader>
        <CardContent className='text-muted-foreground text-xs'>
          {topupHint}
        </CardContent>
      </Card>
    )
  }

  const period = overview.open_period
  const rawUsedPercent =
    period && period.limit_quota > 0
      ? (period.used_quota / period.limit_quota) * 100
      : 0
  let periodText: ReactNode = t('No open credit period')
  if (period) {
    periodText = t('Period #{{no}} · {{range}}', {
      no: period.period_no,
      range: formatCreditPeriodRange(period, formatTimestampToDate),
    })
  } else if (isCreditAwaitingPayment(enterprise, false)) {
    periodText = (
      <StatusBadge
        label={t('Awaiting payment')}
        variant='warning'
        copyable={false}
      />
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardDescription>{t('Current period usage')}</CardDescription>
        <CardTitle className='flex items-center gap-2 font-mono text-xl'>
          <span>
            {period ? formatQuotaWithCurrency(period.used_quota) : '—'}
            <span className='text-muted-foreground text-base font-normal'>
              {' / '}
              {period ? formatQuotaWithCurrency(period.limit_quota) : '—'}
            </span>
          </span>
          {suspended}
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        <Progress
          value={Math.min(100, rawUsedPercent)}
          aria-label={t('Current period usage')}
        />
        <div className='text-muted-foreground text-xs'>{periodText}</div>
        {period && (
          <CreditAlertHint
            alertPercent={enterprise.credit_alert_percent}
            usedPercent={rawUsedPercent}
          />
        )}
      </CardContent>
    </Card>
  )
}

/** 团队角色第一张卡：本团队本月消耗，设了预算时带预算进度 */
function TeamSpendCard(props: { overview: EnterpriseOverview }) {
  const { t } = useTranslation()
  const budget = props.overview.team_budget
  return (
    <Card>
      <CardHeader>
        <CardDescription>{t('Team spend this month')}</CardDescription>
        <CardTitle className='font-mono text-xl'>
          {formatQuotaWithCurrency(props.overview.month.quota)}
          {budget && (
            <span className='text-muted-foreground text-base font-normal'>
              {' / '}
              {formatQuotaWithCurrency(budget.budget_quota)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className='text-muted-foreground text-xs'>
        {budget ? (
          <TeamBudgetMeter
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
      </CardContent>
    </Card>
  )
}

/** 第四张卡：企业视角团队 · 成员，团队角色只数本团队成员 */
function OrgCard(props: { overview: EnterpriseOverview; teamScoped: boolean }) {
  const { t } = useTranslation()
  const { org, scope } = props.overview
  const teamSearch = scope ? { team_id: scope.team_id } : {}
  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {props.teamScoped
            ? `${scope?.team_name ?? ''} · ${t('Members')}`
            : t('Teams · Members')}
        </CardDescription>
        <CardTitle className='font-mono text-xl'>
          {props.teamScoped ? (
            org.members
          ) : (
            <>
              {org.teams}
              <span className='text-muted-foreground text-base font-normal'>
                {' · '}
              </span>
              {org.members}
            </>
          )}
        </CardTitle>
        <CardAction>
          <Link
            to='/enterprise/teams'
            search={teamSearch}
            className={LINK_CLASS}
          >
            {t('Teams')}
            <ArrowRight className='size-3' aria-hidden='true' />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className='text-muted-foreground text-xs'>
        {t('{{count}} can sign in', { count: org.login_members })}
      </CardContent>
    </Card>
  )
}
