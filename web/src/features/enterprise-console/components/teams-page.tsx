import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Plus, Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { useTeams } from '../hooks/use-team-options'
import {
  canManageMembers,
  canManageTeams,
  isTeamScoped,
} from '../lib/member-roles'
import type { EnterpriseTeamsSearch } from '../search-schema'
import { EnterpriseGuard } from './enterprise-guard'
import { MemberDialog } from './member-dialog'
import { MemberImportDialog } from './member-import-dialog'
import { MembersSection } from './members-section'
import { TeamDialog } from './team-dialog'
import { type TeamSelection, TeamPanel } from './team-panel'

const route = getRouteApi('/_authenticated/enterprise/teams')

/**
 * 团队页：左边团队（人数、本月消耗、预算），右边成员；选中团队与成员筛选都在 URL 里。
 * team_admin / developer 只看本团队，没有「全部」。
 */
export function EnterpriseTeams() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { data: enterprise } = useEnterpriseSelf()
  const actor = enterprise?.actor
  const teamScoped = isTeamScoped(actor)
  const teams = useTeams()
  const [teamDialog, setTeamDialog] = useState(false)
  const [memberDialog, setMemberDialog] = useState(false)
  const [importing, setImporting] = useState(false)

  let selected: TeamSelection = search.team_id ?? 'all'
  if (teamScoped && actor) selected = actor.team_id

  const updateSearch = (patch: Partial<EnterpriseTeamsSearch>) =>
    void navigate({
      search: (prev: EnterpriseTeamsSearch) => ({
        ...prev,
        page: undefined,
        ...patch,
      }),
      replace: true,
    })

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['enterprise'] })

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Teams')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          {canManageMembers(actor) && (
            <>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setImporting(true)}
              >
                <Upload className='h-4 w-4' />
                {t('Import CSV')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setMemberDialog(true)}
              >
                <Plus className='h-4 w-4' />
                {t('Add Member')}
              </Button>
            </>
          )}
          {canManageTeams(actor) && (
            <Button size='sm' onClick={() => setTeamDialog(true)}>
              <Plus className='h-4 w-4' />
              {t('Add Team')}
            </Button>
          )}
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <EnterpriseGuard>
            <div className='grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]'>
              <Card>
                <CardContent>
                  <TeamPanel
                    teams={teams.data ?? []}
                    selected={selected}
                    showAll={!teamScoped}
                    onSelect={(selection) =>
                      updateSearch({
                        team_id: selection === 'all' ? undefined : selection,
                      })
                    }
                    canManage={canManageTeams(actor)}
                  />
                </CardContent>
              </Card>
              <MembersSection
                team={selected}
                actor={actor}
                search={search}
                onSearchChange={updateSearch}
              />
            </div>
          </EnterpriseGuard>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <TeamDialog
        open={teamDialog}
        onOpenChange={setTeamDialog}
        onSaved={refresh}
      />
      <MemberDialog
        open={memberDialog}
        onOpenChange={setMemberDialog}
        defaultTeamId={typeof selected === 'number' ? selected : 0}
        lockTeam={teamScoped}
        onSaved={refresh}
      />
      <MemberImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImported={refresh}
      />
    </>
  )
}
