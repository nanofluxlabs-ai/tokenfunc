import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { SectionPageLayout } from '@/components/layout'

/** 用户消耗详情（B5 实现） */
export function UserConsumptionDetailPage() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('User consumption details')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <EmptyState title={t('Coming soon')} />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
