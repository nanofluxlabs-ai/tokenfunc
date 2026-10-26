import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getUsageSummary, listMembers, USAGE_EXPORT_URL } from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { useTeams } from '../hooks/use-team-options'
import { isTeamScoped } from '../lib/member-roles'
import { usageAttributionFor, usageRangeFromPreset } from '../lib/usage-range'
import { EnterpriseGuard } from './enterprise-guard'
import { EnterpriseRoleBadge } from './enterprise-role-badge'
import { UsagePanel } from './usage-panel'

const route = getRouteApi('/_authenticated/enterprise/usage')

/**
 * 报表上方的上下文条：概览下钻来的给「返回企业概览」；团队页深链来的标出团队 / 成员筛选并给清除入口。
 * 概览与报表是平级菜单，这里是来源提示而不是「上级页面」，从侧边栏直接进入时不显示。
 */
function UsageContextBar(props: {
  fromOverview: boolean
  teamId?: number
  memberId?: number
}) {
  const { t } = useTranslation()
  const search = route.useSearch()
  const teams = useTeams()
  const member = useQuery({
    queryKey: ['enterprise', 'members', 'by-id', props.memberId],
    queryFn: async () =>
      requireServerSuccess(
        await listMembers({ member_id: props.memberId, page_size: 1 })
      ).data?.items[0] ?? null,
    enabled: Boolean(props.memberId),
  })
  const filtered = Boolean(props.teamId || props.memberId)
  if (!props.fromOverview && !filtered) {
    return null
  }
  const teamName = teams.data?.find((team) => team.id === props.teamId)?.name
  return (
    <div className='flex flex-wrap items-center gap-2 text-sm'>
      {props.fromOverview && (
        <Button
          variant='ghost'
          size='sm'
          className='-ms-2'
          render={<Link to='/enterprise/overview' />}
        >
          <ArrowLeft className='size-4' aria-hidden='true' />
          {t('Back to Enterprise Overview')}
        </Button>
      )}
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
      {filtered && (
        <Button
          variant='ghost'
          size='sm'
          render={
            <Link
              to='/enterprise/usage'
              search={{ ...search, team_id: undefined, member_id: undefined }}
            />
          }
        >
          {t('Clear filter')}
        </Button>
      )}
    </div>
  )
}

export function EnterpriseUsage() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { data: enterprise } = useEnterpriseSelf()
  const teamScoped = isTeamScoped(enterprise?.actor)
  // 区间与归属页签以地址栏为准：每次切换压一条历史，后退 / 前进 / 刷新 / 分享都是同一视图。
  // 概览下钻带服务端口径的 from / to；只有快捷档时按浏览器日期换算；都没有默认本月
  const range = useMemo(
    () =>
      search.from && search.to
        ? { from: search.from, to: search.to }
        : usageRangeFromPreset(search.range ?? 'month'),
    [search.from, search.to, search.range]
  )
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
            <UsageContextBar
              fromOverview={search.source === 'overview'}
              teamId={search.team_id}
              memberId={search.member_id}
            />
            <UsagePanel
              queryKey={['enterprise']}
              fetchSummary={getUsageSummary}
              exportUrl={USAGE_EXPORT_URL}
              initialGroupBy={search.group_by}
              range={range}
              onRangeChange={(next) =>
                void navigate({
                  search: (prev) => ({ ...prev, ...next, range: undefined }),
                })
              }
              attribution={usageAttributionFor(search.group_by, teamScoped)}
              onAttributionChange={(group) =>
                void navigate({
                  search: (prev) => ({ ...prev, group_by: group }),
                })
              }
              hideTeamDimension={teamScoped}
              filter={{ team_id: search.team_id, member_id: search.member_id }}
            />
          </div>
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
