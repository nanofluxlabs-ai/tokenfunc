import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DailyQuotaBarChart } from '@/components/charts/daily-quota-bar-chart'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getEnterpriseOverview, listCreditPeriods, listLedger } from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { isTeamScoped } from '../lib/member-roles'
import { CreditPeriodsTable, LedgerTable } from './billing-tables'
import { EnterpriseGuard } from './enterprise-guard'
import { OverviewKpiCards } from './overview-kpi-cards'
import { OverviewTodos } from './overview-todos'

/** 默认收起的财务区块；内容在第一次展开时才加载 */
function FinanceSection(props: {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
      <CollapsibleTrigger className='flex items-center gap-1 text-sm font-medium'>
        <ChevronRight
          aria-hidden='true'
          className={cn(
            'size-4 transition-transform',
            props.open && 'rotate-90'
          )}
        />
        {props.title}
      </CollapsibleTrigger>
      <CollapsibleContent className='mt-2'>{props.children}</CollapsibleContent>
    </Collapsible>
  )
}

function OverviewContent() {
  const { t } = useTranslation()
  const self = useEnterpriseSelf()
  const teamScoped = isTeamScoped(self.data?.actor)
  const overview = useQuery({
    queryKey: ['enterprise', 'overview'],
    queryFn: async () =>
      requireServerSuccess(await getEnterpriseOverview()).data ?? null,
  })
  const data = overview.data
  const isCredit = data?.enterprise.billing_mode === 'credit'
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [periodsOpen, setPeriodsOpen] = useState(false)
  // 预付企业第一张卡要显示最近充值，流水提前取；其余情况展开时再取
  const ledger = useQuery({
    queryKey: ['enterprise', 'ledger'],
    queryFn: async () =>
      requireServerSuccess(await listLedger({ page_size: 20 })).data?.items ??
      [],
    enabled: !teamScoped && data !== undefined && (ledgerOpen || !isCredit),
  })
  const periods = useQuery({
    queryKey: ['enterprise', 'credit-periods'],
    queryFn: async () =>
      requireServerSuccess(await listCreditPeriods({ page_size: 12 })).data
        ?.items ?? [],
    enabled: !teamScoped && isCredit && periodsOpen,
  })
  const lastTopupAt = useMemo(
    () =>
      ledger.data?.find((entry) => entry.type === 'topup')?.created_at ?? null,
    [ledger.data]
  )

  if (!data) {
    return <LoadingState />
  }

  return (
    <div className='flex flex-col gap-6'>
      <OverviewKpiCards
        overview={data}
        teamScoped={teamScoped}
        lastTopupAt={lastTopupAt}
      />
      <OverviewTodos todos={data.todos} />
      <Card>
        <CardHeader>
          <CardTitle>{t('Spend in the last 30 days')}</CardTitle>
          <CardAction>
            <Link
              to='/enterprise/usage'
              className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs'
            >
              {t('View usage report')}
              <ArrowRight className='size-3' aria-hidden='true' />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <DailyQuotaBarChart
            id='enterprise-overview-daily'
            data={data.daily}
            loading={overview.isFetching}
          />
        </CardContent>
      </Card>
      {!teamScoped && (
        <div className='flex flex-col gap-4'>
          {isCredit && (
            <FinanceSection
              title={t('Credit Periods')}
              open={periodsOpen}
              onOpenChange={setPeriodsOpen}
            >
              <CreditPeriodsTable
                periods={periods.data ?? []}
                isLoading={periods.isLoading}
              />
            </FinanceSection>
          )}
          <FinanceSection
            title={t('Ledger')}
            open={ledgerOpen}
            onOpenChange={setLedgerOpen}
          >
            <LedgerTable
              entries={ledger.data ?? []}
              isLoading={ledger.isLoading}
            />
          </FinanceSection>
        </div>
      )}
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
