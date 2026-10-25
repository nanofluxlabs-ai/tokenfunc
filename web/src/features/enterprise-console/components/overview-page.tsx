import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getEnterpriseOverview, listCreditPeriods, listLedger } from '../api'
import { CreditPeriodsTable, LedgerTable } from './billing-tables'
import { CreditAlertHint } from './credit-alert-hint'
import { EnterpriseGuard } from './enterprise-guard'

function OverviewContent() {
  const { t } = useTranslation()
  const overview = useQuery({
    queryKey: ['enterprise', 'overview'],
    queryFn: async () =>
      requireServerSuccess(await getEnterpriseOverview()).data ?? null,
  })
  const ledger = useQuery({
    queryKey: ['enterprise', 'ledger'],
    queryFn: async () =>
      requireServerSuccess(await listLedger({ page_size: 20 })).data?.items ??
      [],
  })
  const isCredit = overview.data?.enterprise.billing_mode === 'credit'
  const periods = useQuery({
    queryKey: ['enterprise', 'credit-periods'],
    queryFn: async () =>
      requireServerSuccess(await listCreditPeriods({ page_size: 12 })).data
        ?.items ?? [],
    enabled: isCredit,
  })
  const data = overview.data
  const period = data?.open_period ?? null
  const rawUsedPercent =
    period && period.limit_quota > 0
      ? (period.used_quota / period.limit_quota) * 100
      : 0
  const usedPercent = Math.min(100, rawUsedPercent)

  return (
    <div className='flex flex-col gap-6'>
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardDescription>{t('Billing Mode')}</CardDescription>
            <CardTitle className='flex items-center gap-2'>
              {isCredit ? t('Credit') : t('Prepaid')}
              {data?.enterprise.status === 'suspended' && (
                <StatusBadge
                  label={t('Suspended')}
                  variant='danger'
                  copyable={false}
                />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className='text-muted-foreground text-sm'>
            {isCredit
              ? t(
                  'Usage is billed per credit period; a bill is issued when the period ends.'
                )
              : t(
                  'Top-ups are registered by your account manager after bank transfer.'
                )}
          </CardContent>
        </Card>
        {isCredit ? (
          <>
            <Card>
              <CardHeader>
                <CardDescription>{t('Current period usage')}</CardDescription>
                <CardTitle className='font-mono'>
                  {period ? formatQuotaWithCurrency(period.used_quota) : '—'}
                  <span className='text-muted-foreground text-base font-normal'>
                    {' / '}
                    {period ? formatQuotaWithCurrency(period.limit_quota) : '—'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress
                  value={usedPercent}
                  aria-label={t('Current period usage')}
                />
                {period && (
                  <CreditAlertHint
                    alertPercent={data?.enterprise.credit_alert_percent ?? 0}
                    usedPercent={rawUsedPercent}
                  />
                )}
                <p className='text-muted-foreground mt-2 text-xs'>
                  {t(
                    'Requests are rejected once the period limit is reached. Contact your account manager to raise it.'
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>{t('Current period')}</CardDescription>
                <CardTitle>{period ? `#${period.period_no}` : '—'}</CardTitle>
              </CardHeader>
              <CardContent className='text-sm'>
                {period
                  ? `${formatTimestampToDate(period.start_at)} ~ ${formatTimestampToDate(period.end_at)}`
                  : t('No open credit period')}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className='md:col-span-2'>
            <CardHeader>
              <CardDescription>{t('Balance')}</CardDescription>
              <CardTitle className='font-mono'>
                {data ? formatQuotaWithCurrency(data.balance_quota) : '—'}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>

      {isCredit && (
        <section className='flex flex-col gap-2'>
          <h3 className='text-sm font-medium'>{t('Credit Periods')}</h3>
          <CreditPeriodsTable
            periods={periods.data ?? []}
            isLoading={periods.isLoading}
          />
        </section>
      )}
      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-medium'>{t('Ledger')}</h3>
        <LedgerTable entries={ledger.data ?? []} isLoading={ledger.isLoading} />
      </section>
    </div>
  )
}

export function EnterpriseOverview() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Enterprise Overview')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <EnterpriseGuard>
          <OverviewContent />
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
