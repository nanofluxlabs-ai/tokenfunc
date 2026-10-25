import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { Plus, UserCog } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/use-debounce'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listEnterpriseTokens } from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { useTeamOptions, useTeams } from '../hooks/use-team-options'
import { isTeamScoped } from '../lib/member-roles'
import { isTeamBudgetBlocked } from '../lib/team-budget'
import type { EnterpriseKeysSearch } from '../search-schema'
import type { EnterpriseToken } from '../types'
import { EnterpriseGuard } from './enterprise-guard'
import { EntitySelect } from './entity-select'
import { MEMBER_PICKER_ANY, MemberPicker } from './member-picker'
import { TokenAssignDialog } from './token-assign-dialog'
import { TokenCreateDialog } from './token-create-dialog'

const PAGE_SIZE = 20
// 筛选值：-1 不筛选，0 未指定持有人，正数为具体 id
const ANY = MEMBER_PICKER_ANY

const route = getRouteApi('/_authenticated/enterprise/keys')

function KeysTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { data: enterprise } = useEnterpriseSelf()
  const teamOptions = useTeamOptions()
  const teams = useTeams()
  // 已超预算且勾了拦截的团队：其 key 行在状态列标「预算拦截中」
  const blockedTeamIds = useMemo(
    () =>
      new Set(
        (teams.data ?? []).filter(isTeamBudgetBlocked).map((team) => team.id)
      ),
    [teams.data]
  )
  const teamScoped = isTeamScoped(enterprise?.actor)
  const [keyword, setKeyword] = useState(search.q ?? '')
  const debouncedKeyword = useDebounce(keyword, 400)
  const [assigning, setAssigning] = useState<EnterpriseToken | null>(null)

  const teamId = search.team_id ?? ANY
  const memberId = search.member_id ?? ANY
  const page = search.page ?? 1

  const update = (patch: Partial<EnterpriseKeysSearch>) =>
    void navigate({
      search: (prev: EnterpriseKeysSearch) => ({ ...prev, page: 1, ...patch }),
      replace: true,
    })

  // 关键字防抖后再写入 URL，避免每个字符都产生一次导航
  useEffect(() => {
    const next = debouncedKeyword || undefined
    if (next === search.q) return
    void navigate({
      search: (prev: EnterpriseKeysSearch) => ({ ...prev, page: 1, q: next }),
      replace: true,
    })
  }, [debouncedKeyword, search.q, navigate])

  const { data, isLoading } = useQuery({
    queryKey: ['enterprise', 'tokens', search.q, teamId, memberId, page],
    queryFn: async () =>
      requireServerSuccess(
        await listEnterpriseTokens({
          keyword: search.q || undefined,
          team_id: teamId === ANY ? undefined : teamId,
          member_id: memberId === ANY ? undefined : memberId,
          p: page,
          page_size: PAGE_SIZE,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const columns: StaticDataTableColumn<EnterpriseToken>[] = [
    {
      id: 'name',
      header: t('Name'),
      cell: (row) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{row.name}</span>
          <span className='text-muted-foreground font-mono text-xs'>
            sk-{row.key}
          </span>
        </div>
      ),
    },
    {
      id: 'team',
      header: t('Team'),
      cell: (row) => row.team_name || '—',
    },
    {
      id: 'holder',
      header: t('Holder'),
      cell: (row) =>
        row.member_id ? (
          row.member_name
        ) : (
          <span className='text-muted-foreground'>{t('Team key')}</span>
        ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => (
        <div className='flex flex-wrap gap-1'>
          <StatusBadge
            label={row.status === 1 ? t('Enabled') : t('Disabled')}
            variant={row.status === 1 ? 'success' : 'neutral'}
            copyable={false}
          />
          {blockedTeamIds.has(row.team_id) && (
            <StatusBadge
              label={t('Blocked by budget')}
              variant='danger'
              copyable={false}
            />
          )}
        </div>
      ),
    },
    {
      id: 'used',
      header: t('Used'),
      cell: (row) => formatQuotaWithCurrency(row.used_quota),
    },
    {
      id: 'remain',
      header: t('Remaining'),
      cell: (row) =>
        row.unlimited_quota
          ? t('Unlimited')
          : formatQuotaWithCurrency(row.remain_quota),
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (row) => (
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={t('Assign API Key')}
          onClick={() => setAssigning(row)}
        >
          <UserCog />
        </Button>
      ),
    },
  ]

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='max-w-xs'
          placeholder={t('Search key name or holder...')}
          aria-label={t('Search API keys')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        {!teamScoped && (
          <div className='w-48'>
            <EntitySelect
              aria-label={t('Filter by team')}
              value={teamId}
              onChange={(value) =>
                update({
                  team_id: value === ANY ? undefined : value,
                  member_id: undefined,
                })
              }
              options={[{ value: ANY, label: t('All Teams') }, ...teamOptions]}
              noneLabel={t('Default team')}
            />
          </div>
        )}
        <div className='w-56'>
          <MemberPicker
            aria-label={t('Filter by holder')}
            value={memberId}
            onChange={(value) =>
              update({ member_id: value === ANY ? undefined : value })
            }
            teamId={teamId > 0 ? teamId : undefined}
            allowAny
            noneLabel={t('Team key (no holder)')}
          />
        </div>
        <div className='flex-1' />
        {enterprise?.actor?.is_owner && (
          <Button variant='link' size='sm' render={<Link to='/keys' />}>
            {t('Advanced key settings')}
          </Button>
        )}
      </div>
      <StaticDataTable
        columns={columns}
        data={data?.items ?? []}
        getRowKey={(row) => row.id}
        empty={!isLoading && (data?.items.length ?? 0) === 0}
        emptyContent={t('No API keys yet')}
      />
      <div className='text-muted-foreground flex items-center justify-end gap-2 text-sm'>
        <span>{t('Total: {{count}}', { count: total })}</span>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => update({ page: page - 1 })}
        >
          {t('Previous')}
        </Button>
        <span>
          {page} / {pageCount}
        </span>
        <Button
          variant='outline'
          size='sm'
          disabled={page >= pageCount}
          onClick={() => update({ page: page + 1 })}
        >
          {t('Next')}
        </Button>
      </div>
      <TokenAssignDialog
        token={assigning}
        onOpenChange={(open) => !open && setAssigning(null)}
        onSaved={() =>
          void queryClient.invalidateQueries({ queryKey: ['enterprise'] })
        }
      />
    </div>
  )
}

export function EnterpriseKeys() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const { data: enterprise } = useEnterpriseSelf()
  const [creating, setCreating] = useState(false)
  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Enterprise API Keys')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          {enterprise && (
            <Button size='sm' onClick={() => setCreating(true)}>
              <Plus className='h-4 w-4' />
              {t('Create API Key')}
            </Button>
          )}
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <EnterpriseGuard>
            <KeysTable />
          </EnterpriseGuard>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <TokenCreateDialog
        open={creating}
        onOpenChange={setCreating}
        defaultTeamId={search.team_id}
        onCreated={() =>
          void queryClient.invalidateQueries({ queryKey: ['enterprise'] })
        }
      />
    </>
  )
}
