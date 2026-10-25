import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'

import { getUsageSummary, USAGE_EXPORT_URL } from '../api'
import { EnterpriseGuard } from './enterprise-guard'
import { UsagePanel } from './usage-panel'

const route = getRouteApi('/_authenticated/enterprise/usage')

export function EnterpriseUsage() {
  const { t } = useTranslation()
  const search = route.useSearch()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Usage Report')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <EnterpriseGuard>
          <UsagePanel
            queryKey={['enterprise']}
            fetchSummary={getUsageSummary}
            exportUrl={USAGE_EXPORT_URL}
            initialGroupBy={search.group_by}
            filter={{ team_id: search.team_id, member_id: search.member_id }}
          />
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
