import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'

import { getUsageSummary, USAGE_EXPORT_URL } from '../api'
import { EnterpriseGuard } from './enterprise-guard'
import { UsagePanel } from './usage-panel'

export function EnterpriseUsage() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Usage Report')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <EnterpriseGuard>
          <UsagePanel
            queryKey={['enterprise']}
            fetchSummary={getUsageSummary}
            exportUrl={USAGE_EXPORT_URL}
          />
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
