import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getEnterpriseOverview, listLedger } from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { isTeamScoped } from '../lib/member-roles'
import { buildOverviewDailySnapshot } from '../lib/overview'
import { EnterpriseGuard } from './enterprise-guard'
import { EnterpriseRoleBadge } from './enterprise-role-badge'
import { OverviewHero } from './overview-hero'
import { OverviewKpiCards } from './overview-kpi-cards'
import { OverviewModelTop } from './overview-model-top'
import { OverviewQuickLinks } from './overview-quick-links'
import { OverviewTodos } from './overview-todos'
import { OverviewTrendCard } from './overview-trend-card'

/**
 * 企业概览只看固定时间窗（今日 / 近 7 天）与账户状态；任意区间、按日明细、归属分析都在用量报表，
 * 两页同一个数字只在下钻时对上，不重复画同一张图或同一张表。
 */
function OverviewContent() {
  const self = useEnterpriseSelf()
  const teamScoped = isTeamScoped(self.data?.actor)
  const overview = useQuery({
    queryKey: ['enterprise', 'overview'],
    queryFn: async () =>
      requireServerSuccess(await getEnterpriseOverview()).data ?? null,
  })
  const data = overview.data
  const isCredit = data?.enterprise.billing_mode === 'credit'
  // 预付企业账户卡要显示最近充值；资金流水与授信账期的完整列表在财务对账页
  const ledger = useQuery({
    queryKey: ['enterprise', 'ledger'],
    queryFn: async () =>
      requireServerSuccess(await listLedger({ page_size: 20 })).data?.items ??
      [],
    enabled: !teamScoped && data !== undefined && data !== null && !isCredit,
  })
  const lastTopupAt = useMemo(
    () =>
      ledger.data?.find((entry) => entry.type === 'topup')?.created_at ?? null,
    [ledger.data]
  )
  const snapshot = useMemo(
    () => buildOverviewDailySnapshot(data?.daily ?? []),
    [data?.daily]
  )

  if (!data) {
    return <LoadingState />
  }

  return (
    <div className='flex flex-col gap-4'>
      <OverviewHero
        overview={data}
        teamScoped={teamScoped}
        lastTopupAt={lastTopupAt}
        refreshing={overview.isFetching}
        onRefresh={() => void overview.refetch()}
      />
      <OverviewTodos todos={data.todos} />
      <OverviewKpiCards snapshot={snapshot} loading={overview.isLoading} />
      <div className='grid gap-4 xl:grid-cols-3'>
        <div className='min-w-0 xl:col-span-2'>
          <OverviewTrendCard
            days={snapshot.last7}
            loading={overview.isFetching}
          />
        </div>
        {/* 手机侧栏收在汉堡菜单里，快捷入口排到趋势图前面 */}
        <div className='order-first min-w-0 xl:order-none'>
          <OverviewQuickLinks overview={data} teamScoped={teamScoped} />
        </div>
      </div>
      <OverviewModelTop today={snapshot.today.day} />
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
