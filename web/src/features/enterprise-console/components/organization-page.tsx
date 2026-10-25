import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'

import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { useTeams } from '../hooks/use-team-options'
import { canManageTeams, isTeamScoped } from '../lib/member-roles'
import { EnterpriseGuard } from './enterprise-guard'
import { MembersSection } from './members-section'
import { type TeamSelection, TeamPanel } from './team-panel'

function OrganizationContent() {
  const { data: enterprise } = useEnterpriseSelf()
  const actor = enterprise?.actor
  const teams = useTeams()
  const [selected, setSelected] = useState<TeamSelection>('all')

  // 团队角色只有自己的团队，直接选中它
  const scopedTeamId = isTeamScoped(actor) ? actor?.team_id : undefined
  useEffect(() => {
    if (scopedTeamId) setSelected(scopedTeamId)
  }, [scopedTeamId])

  return (
    <div className='grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]'>
      <Card>
        <CardContent>
          <TeamPanel
            teams={teams.data ?? []}
            selected={selected}
            onSelect={setSelected}
            canManage={canManageTeams(actor)}
          />
        </CardContent>
      </Card>
      <MembersSection team={selected} actor={actor} />
    </div>
  )
}

export function EnterpriseOrganization() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Teams')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <EnterpriseGuard>
          <OrganizationContent />
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
