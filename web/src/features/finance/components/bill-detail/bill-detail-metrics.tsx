import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import { formatBillUsd } from '@/features/enterprise-console/lib/bill-utils'
import type { StatementBalanceSnapshot } from '@/features/enterprise-console/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber, quotaUnitsToDollars } from '@/lib/format'
import { cn } from '@/lib/utils'

import { creditUsagePercent, periodDays } from '../../lib/bill-ref'
import { formatTokenAmount } from '../../lib/token-amount'
import type { FinanceBillContext } from '../../types'
import { MetricCard } from '../metric-card'
import { SectionBlock as Block } from '../section-block'
import { billDay } from './bill-day'

type BillDetailMetricsProps = {
  context: FinanceBillContext
  /** 请求数：已冻结账单取快照合计，否则取实时汇总 */
  requestCount: number
  requestsLoading: boolean
}

/** 账单详情汇总卡：总额、已付 / 未付、授信额度、使用率、账期、出账 / 到期日、请求数、Token 消耗 */
export function BillDetailMetrics(props: BillDetailMetricsProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const context = props.context
  const summary = context.summary
  const bill = context.bill
  const isStatement = summary.bill_type === 'statement'
  // 与列表同口径：账单取出账冻结的两列，进行中账期为日聚合实时求和（后端放在 summary.token_usage）
  const promptTokens = summary.token_usage?.prompt_tokens ?? 0
  const completionTokens = summary.token_usage?.completion_tokens ?? 0
  const currency = bill?.currency || context.enterprise?.currency || 'USD'
  const total = Number.parseFloat(summary.total_usd)
  const paid = Number.parseFloat(summary.paid_usd)
  const usagePercent = creditUsagePercent(
    summary.used_quota,
    summary.limit_quota
  )
  const days = periodDays(summary.period_start, summary.period_end)
  const cycleLabel =
    context.enterprise?.credit_cycle_type === 'natural_month'
      ? `${t('Calendar month')} · ${t('{{count}} days', { count: days })}`
      : t('{{count}} days', { count: days })

  // 卡片数随账单类型变化（月结单 5 张、授信账单最多 8 张）：宽屏按实际张数定列数，避免最后一张孤零零独占一行
  const cards: Array<{ key: string; node: React.ReactNode }> = [
    {
      key: 'total',
      node: (
        <MetricCard
          label={isStatement ? t('Consumption') : t('Total amount')}
          value={`${currency} ${formatBillUsd(total)}`}
        />
      ),
    },
  ]
  if (context.kind === 'bill' && !isStatement) {
    cards.push({
      key: 'paid',
      node: (
        <MetricCard
          label={t('Paid')}
          value={`${currency} ${formatBillUsd(paid)}`}
          hint={`${t('Outstanding')}: ${currency} ${formatBillUsd(total - paid)}`}
        />
      ),
    })
  }
  if (summary.limit_quota > 0) {
    cards.push({
      key: 'limit',
      node: (
        <MetricCard
          label={t('Credit limit (USD)')}
          value={`$${formatBillUsd(quotaUnitsToDollars(summary.limit_quota))}`}
        />
      ),
    })
  }
  if (usagePercent != null) {
    cards.push({
      key: 'usage',
      node: (
        <MetricCard
          label={t('Usage rate')}
          value={`${usagePercent.toFixed(2)}%`}
        />
      ),
    })
  }
  cards.push({
    key: 'period',
    node: (
      <MetricCard
        // 日期区间放不进手机半宽卡，单独占一行
        className='col-span-2 sm:col-span-1'
        label={t('Billing period')}
        value={
          <span className='text-lg'>
            {billDay(summary.period_start)} ~ {billDay(summary.period_end - 1)}
          </span>
        }
        hint={cycleLabel}
      />
    ),
  })
  if (context.kind === 'bill') {
    cards.push({
      key: 'issued',
      node: (
        <MetricCard
          label={t('Issued')}
          value={<span className='text-lg'>{billDay(summary.issued_at)}</span>}
          hint={
            isStatement ? undefined : `${t('Due')}: ${billDay(summary.due_at)}`
          }
        />
      ),
    })
  }
  cards.push(
    {
      key: 'requests',
      node: (
        <MetricCard
          label={t('Requests')}
          value={formatNumber(props.requestCount, locale)}
          loading={props.requestsLoading}
        />
      ),
    },
    {
      key: 'tokens',
      node: (
        <MetricCard
          label={t('Token usage')}
          value={formatTokenAmount(promptTokens + completionTokens)}
          hint={`${t('Input')} ${formatTokenAmount(promptTokens)} · ${t('Output')} ${formatTokenAmount(completionTokens)}`}
        />
      ),
    }
  )

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 lg:grid-cols-3',
        WIDE_COLUMNS[cards.length] ?? 'xl:grid-cols-4'
      )}
    >
      {cards.map((card) => (
        <Fragment key={card.key}>{card.node}</Fragment>
      ))}
    </div>
  )
}

/** 宽屏列数（Tailwind 类名必须是字面量）：5 张以内排成一行；6 张 3×2；更多按 4 列折行 */
const WIDE_COLUMNS: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-3',
}

const STATEMENT_BALANCE_KEYS = [
  'opening_quota',
  'topup_quota',
  'consumption_quota',
  'adjustment_quota',
  'closing_quota',
] as const

/** 预付月结单五栏：期初、充值、消费、调整、期末 */
export function StatementBalanceBlock(props: {
  snapshot: StatementBalanceSnapshot
}) {
  const { t } = useTranslation()
  const labels: Record<(typeof STATEMENT_BALANCE_KEYS)[number], string> = {
    opening_quota: t('Opening balance'),
    topup_quota: t('Top-ups'),
    consumption_quota: t('Consumption'),
    adjustment_quota: t('Adjustments'),
    closing_quota: t('Closing balance'),
  }
  return (
    <Block title={t('Monthly statement')}>
      <div className='grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-5'>
        {STATEMENT_BALANCE_KEYS.map((key) => (
          <div key={key}>
            <div className='text-muted-foreground'>{labels[key]}</div>
            <div className='font-mono'>
              {formatQuotaWithCurrency(Number(props.snapshot[key] ?? 0))}
            </div>
          </div>
        ))}
      </div>
    </Block>
  )
}
