import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'

import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { useTeams } from '../hooks/use-team-options'
import { isTeamScoped, MEMBER_ROLE_LABELS } from '../lib/member-roles'

/** 企业页标题右侧的当前身份：角色，团队角色再带团队名；企业主不显示 */
export function EnterpriseRoleBadge() {
  const { t } = useTranslation()
  const { data: enterprise } = useEnterpriseSelf()
  const teams = useTeams()
  const actor = enterprise?.actor
  if (!actor || actor.is_owner) return null
  let label = t(MEMBER_ROLE_LABELS[actor.role])
  if (isTeamScoped(actor)) {
    const teamName = teams.data?.find((team) => team.id === actor.team_id)?.name
    if (teamName) label = `${label} · ${teamName}`
  }
  return <StatusBadge label={label} variant='info' copyable={false} />
}
