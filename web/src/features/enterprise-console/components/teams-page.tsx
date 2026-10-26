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
import type { Team } from '../types'
import { EnterpriseGuard } from './enterprise-guard'
import { MemberDialog } from './member-dialog'
import { MemberImportDialog } from './member-import-dialog'
import { MembersSection } from './members-section'
import { TeamBudgetMeter } from './team-budget-meter'
import { TeamDialog } from './team-dialog'
import { type TeamSelection, TeamPanel } from './team-panel'

const route = getRouteApi('/_authenticated/enterprise/teams')

/** 成员表上方的团队页头：名称、人数、预算进度；预算不放进左侧列表，避免每行都挤一条进度条 */
function TeamHeaderCard(props: { team: Team }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardContent className='flex flex-wrap items-center gap-x-6 gap-y-2'>
        <div className='flex items-baseline gap-2'>
          <span className='text-base font-semibold'>{props.team.name}</span>
          <span className='text-muted-foreground text-sm'>
            {t('{{count}} members', { count: props.team.member_count })}
          </span>
        </div>
        <div className='min-w-64 flex-1'>
          <TeamBudgetMeter team={props.team} />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * 团队页：左边团队（人数、本月消耗、预算），右边成员；选中团队与成员筛选都在 URL 里。
 * team_admin / developer 一人只属一个团队，不显示团队列表，改为一行团队页头（名称、人数、预算）+ 整行宽的成员表。
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
  // 团队角色：本团队；企业视角：当前选中的团队（「全部成员」时无）
  const selectedTeam = teams.data?.find((team) => team.id === selected)
  const ownTeam = teamScoped ? selectedTeam : undefined

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
            {teamScoped ? (
              <div className='flex flex-col gap-4'>
                {ownTeam && <TeamHeaderCard team={ownTeam} />}
                <MembersSection
                  team={selected}
                  actor={actor}
                  search={search}
                  onSearchChange={updateSearch}
                />
              </div>
            ) : (
              <div className='grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]'>
                <Card>
                  <CardContent>
                    <TeamPanel
                      teams={teams.data ?? []}
                      selected={selected}
                      showAll
                      onSelect={(selection) =>
                        updateSearch({
                          team_id: selection === 'all' ? undefined : selection,
                        })
                      }
                      canManage={canManageTeams(actor)}
                    />
                  </CardContent>
                </Card>
                <div className='flex flex-col gap-4'>
                  {selectedTeam && <TeamHeaderCard team={selectedTeam} />}
                  <MembersSection
                    team={selected}
                    actor={actor}
                    search={search}
                    onSearchChange={updateSearch}
                  />
                </div>
              </div>
            )}
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
