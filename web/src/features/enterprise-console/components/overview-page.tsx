import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
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
import { requireServerSuccess } from '@/lib/server-error-message'

import { getEnterpriseOverview, listLedger } from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { isTeamScoped } from '../lib/member-roles'
import { EnterpriseGuard } from './enterprise-guard'
import { EnterpriseRoleBadge } from './enterprise-role-badge'
import { OverviewKpiCards } from './overview-kpi-cards'
import { OverviewTodos } from './overview-todos'

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
  // 预付企业第一张卡要显示最近充值；资金流水与授信账期的完整列表在财务对账页
  const ledger = useQuery({
    queryKey: ['enterprise', 'ledger'],
    queryFn: async () =>
      requireServerSuccess(await listLedger({ page_size: 20 })).data?.items ??
      [],
    enabled: !teamScoped && data !== undefined && !isCredit,
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
    </div>
  )
}

export function EnterpriseOverview() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='flex items-center gap-2'>
          {t('Enterprise Overview')}
          <EnterpriseRoleBadge />
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <EnterpriseGuard>
          <OverviewContent />
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
