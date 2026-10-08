import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listDepartments } from '../api'
import { buildDepartmentTree } from '../lib/department-tree'
import { type DepartmentSelection, DepartmentPanel } from './department-panel'
import { EmployeesSection } from './employees-section'
import { EnterpriseGuard } from './enterprise-guard'

function OrganizationContent() {
  const [selected, setSelected] = useState<DepartmentSelection>('all')
  const { data } = useQuery({
    queryKey: ['enterprise', 'departments'],
    queryFn: async () =>
      requireServerSuccess(await listDepartments()).data ?? [],
  })
  const tree = useMemo(() => buildDepartmentTree(data ?? []), [data])

  return (
    <div className='grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]'>
      <Card>
        <CardContent>
          <DepartmentPanel
            tree={tree}
            selected={selected}
            onSelect={setSelected}
          />
        </CardContent>
      </Card>
      <EmployeesSection tree={tree} department={selected} />
    </div>
  )
}

export function EnterpriseOrganization() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Organization')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <EnterpriseGuard>
          <OrganizationContent />
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
