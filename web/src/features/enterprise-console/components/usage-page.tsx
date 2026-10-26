import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getUsageSummary, listMembers, USAGE_EXPORT_URL } from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { useTeams } from '../hooks/use-team-options'
import { isTeamScoped } from '../lib/member-roles'
import { EnterpriseGuard } from './enterprise-guard'
import { EnterpriseRoleBadge } from './enterprise-role-badge'
import { UsagePanel } from './usage-panel'

const route = getRouteApi('/_authenticated/enterprise/usage')

/** 从团队页深链过来时在报表上方标出生效的团队 / 成员筛选，并给清除入口 */
function UsageFilterBar(props: { teamId?: number; memberId?: number }) {
  const { t } = useTranslation()
  const teams = useTeams()
  const member = useQuery({
    queryKey: ['enterprise', 'members', 'by-id', props.memberId],
    queryFn: async () =>
      requireServerSuccess(
        await listMembers({ member_id: props.memberId, page_size: 1 })
      ).data?.items[0] ?? null,
    enabled: Boolean(props.memberId),
  })
  if (!props.teamId && !props.memberId) {
    return null
  }
  const teamName = teams.data?.find((team) => team.id === props.teamId)?.name
  return (
    <div className='flex flex-wrap items-center gap-2 text-sm'>
      {props.teamId && (
        <Badge variant='secondary'>
          {t('Team')}: {teamName ?? `#${props.teamId}`}
        </Badge>
      )}
      {props.memberId && (
        <Badge variant='secondary'>
          {t('Member')}: {member.data?.name ?? `#${props.memberId}`}
        </Badge>
      )}
      <Button
        variant='ghost'
        size='sm'
        render={<Link to='/enterprise/usage' />}
      >
        {t('Clear filter')}
      </Button>
    </div>
  )
}

export function EnterpriseUsage() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const { data: enterprise } = useEnterpriseSelf()
  const teamScoped = isTeamScoped(enterprise?.actor)
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='flex items-center gap-2'>
          {t('Usage Report')}
          <EnterpriseRoleBadge />
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <EnterpriseGuard>
          <div className='flex flex-col gap-4'>
            <UsageFilterBar
              teamId={search.team_id}
              memberId={search.member_id}
            />
            <UsagePanel
              queryKey={['enterprise']}
              fetchSummary={getUsageSummary}
              exportUrl={USAGE_EXPORT_URL}
              initialGroupBy={search.group_by}
              hideTeamDimension={teamScoped}
              filter={{ team_id: search.team_id, member_id: search.member_id }}
            />
          </div>
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
