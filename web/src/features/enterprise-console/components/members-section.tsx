import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table'
import {
  KeyRound,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTablePage,
  DataTableRowActionMenu,
  useDataTable,
} from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks/use-debounce'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { deleteMember, listMembers, updateMember } from '../api'
import {
  canManageMembers,
  isTeamScoped,
  MEMBER_ROLE_LABELS,
} from '../lib/member-roles'
import type { EnterpriseTeamsSearch } from '../search-schema'
import type { EnterpriseActor, Member } from '../types'
import { MemberDialog } from './member-dialog'
import { MemberLoginDialog } from './member-login-dialog'
import type { TeamSelection } from './team-panel'
import { TokenMutateSheet } from './token-mutate-sheet'

const DEFAULT_PAGE_SIZE = 10
const ANY = 'all'

type MembersSectionProps = {
  team: TeamSelection
  actor: EnterpriseActor | null | undefined
  /** URL 里的筛选（status / login / q / page） */
  search: EnterpriseTeamsSearch
  onSearchChange: (patch: Partial<EnterpriseTeamsSearch>) => void
}

/** 简单的单选筛选（值为字符串，'all' 表示不筛选） */
function FilterSelect(props: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <Select
      items={props.options}
      value={props.value}
      onValueChange={(value) => value && props.onChange(value)}
    >
      <SelectTrigger aria-label={props.label} className='w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function MembersSection(props: MembersSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState(props.search.q ?? '')
  const debouncedKeyword = useDebounce(keyword, 400)
  const [dialog, setDialog] = useState<{ member?: Member } | null>(null)
  const [login, setLogin] = useState<Member | null>(null)
  const [issuingKey, setIssuingKey] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState<Member | null>(null)
  const [toggling, setToggling] = useState<number | null>(null)
  const manage = canManageMembers(props.actor)
  const teamScoped = isTeamScoped(props.actor)

  const teamId = props.team === ANY ? undefined : props.team
  const page = props.search.page ?? 1
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const { onSearchChange } = props

  // 关键字防抖后再写入 URL
  useEffect(() => {
    const next = debouncedKeyword || undefined
    if (next === props.search.q) return
    onSearchChange({ q: next })
  }, [debouncedKeyword, props.search.q, onSearchChange])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'enterprise',
      'members',
      teamId,
      props.search.q,
      props.search.status,
      props.search.login,
      page,
      pageSize,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listMembers({
          team_id: teamId,
          keyword: props.search.q || undefined,
          status: props.search.status,
          has_login: props.search.login,
          p: page,
          page_size: pageSize,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })

  // 页码进 URL（可分享 / 回退），每页条数只在组件内；改条数回到第 1 页
  const pagination: PaginationState = { pageIndex: page - 1, pageSize }
  const onPaginationChange = (updater: Updater<PaginationState>) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater
    if (next.pageSize !== pageSize) {
      setPageSize(next.pageSize)
      onSearchChange({ page: undefined })
      return
    }
    onSearchChange({ page: next.pageIndex + 1 })
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['enterprise', 'members'] })
    void queryClient.invalidateQueries({ queryKey: ['enterprise', 'teams'] })
    void queryClient.invalidateQueries({ queryKey: ['enterprise', 'tokens'] })
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const result = await deleteMember(deleting.id)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Member deleted'))
      setDeleting(null)
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  const handleToggleStatus = async (row: Member) => {
    const next = row.status === 'active' ? 'disabled' : 'active'
    setToggling(row.id)
    try {
      const result = await updateMember(row.id, {
        team_id: row.team_id,
        name: row.name,
        email: row.email,
        employee_no: row.employee_no,
        status: next,
        remark: row.remark,
      })
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(
        next === 'active' ? t('Member enabled') : t('Member disabled')
      )
      refresh()
    } catch (error) {
      handleServerError(error)
    } finally {
      setToggling(null)
    }
  }

  const loginValue =
    props.search.login === undefined ? ANY : String(props.search.login)

  const columns: ColumnDef<Member>[] = [
    {
      id: 'name',
      header: t('Name'),
      cell: ({ row: { original: row } }) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{row.name}</span>
          {row.email && (
            <span className='text-muted-foreground text-xs'>{row.email}</span>
          )}
        </div>
      ),
    },
    {
      id: 'employee_no',
      header: t('Employee No.'),
      cell: ({ row: { original: row } }) => row.employee_no || '—',
    },
    {
      id: 'team',
      header: t('Team'),
      cell: ({ row: { original: row } }) => row.team_name || '—',
    },
    {
      id: 'login',
      header: t('Console access'),
      cell: ({ row: { original: row } }) =>
        row.user_id > 0 ? (
          <div className='flex flex-col'>
            <span>{row.username}</span>
            <span className='text-muted-foreground text-xs'>
              {t(MEMBER_ROLE_LABELS[row.role])}
            </span>
          </div>
        ) : (
          <span className='text-muted-foreground'>{t('Key only')}</span>
        ),
    },
    {
      id: 'token_count',
      header: t('API Keys'),
      cell: ({ row: { original: row } }) =>
        row.token_count > 0 ? (
          <Link
            to='/enterprise/keys'
            search={{ team_id: row.team_id, member_id: row.id }}
            className='underline-offset-4 hover:underline'
          >
            {row.token_count}
          </Link>
        ) : (
          <span className='text-muted-foreground'>0</span>
        ),
    },
    {
      id: 'month_quota',
      header: t('Spend this month'),
      cell: ({ row: { original: row } }) =>
        row.month_quota > 0 ? (
          <Link
            to='/enterprise/usage'
            search={{ group_by: 'token', member_id: row.id }}
            className='font-mono underline-offset-4 hover:underline'
          >
            {formatQuotaWithCurrency(row.month_quota)}
          </Link>
        ) : (
          <span className='text-muted-foreground font-mono'>
            {formatQuotaWithCurrency(0)}
          </span>
        ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: ({ row: { original: row } }) => (
        <StatusBadge
          label={row.status === 'active' ? t('Active') : t('Disabled')}
          variant={row.status === 'active' ? 'success' : 'neutral'}
          copyable={false}
        />
      ),
    },
    {
      id: 'actions',
      header: t('Actions'),
      enableHiding: false,
      cell: ({ row: { original: row } }) => (
        <div className='-ml-1.5 flex items-center gap-1'>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Issue API Key')}
            disabled={row.status !== 'active'}
            onClick={() => setIssuingKey(row)}
          >
            <KeyRound className='size-4' />
          </Button>
          {manage && (
            <DataTableRowActionMenu ariaLabel={t('Open menu')} modal={false}>
              <DropdownMenuItem onClick={() => setLogin(row)}>
                <UserCog className='size-4' /> {t('Console access')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ member: row })}>
                <Pencil className='size-4' /> {t('Edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={toggling === row.id}
                onClick={() => void handleToggleStatus(row)}
              >
                {row.status === 'active' ? (
                  <PowerOff className='size-4' />
                ) : (
                  <Power className='size-4' />
                )}{' '}
                {row.status === 'active' ? t('Disable') : t('Enable')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setDeleting(row)}
              >
                <Trash2 className='size-4' /> {t('Delete')}
              </DropdownMenuItem>
            </DataTableRowActionMenu>
          )}
        </div>
      ),
    },
  ]

  const { table } = useDataTable({
    data: data?.items ?? [],
    columns,
    pagination,
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total ?? 0,
    enableRowSelection: false,
  })

  return (
    <div className='flex h-full min-h-0 min-w-0 flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='max-w-xs'
          placeholder={t('Search name, email or employee No....')}
          aria-label={t('Search members')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <div className='w-36'>
          <FilterSelect
            label={t('Filter by status')}
            value={props.search.status ?? ANY}
            options={[
              { value: ANY, label: t('All statuses') },
              { value: 'active', label: t('Active') },
              { value: 'disabled', label: t('Disabled') },
            ]}
            onChange={(value) =>
              onSearchChange({
                status:
                  value === ANY ? undefined : (value as 'active' | 'disabled'),
              })
            }
          />
        </div>
        <div className='w-40'>
          <FilterSelect
            label={t('Filter by console access')}
            value={loginValue}
            options={[
              { value: ANY, label: t('All members') },
              { value: 'true', label: t('Can sign in') },
              { value: 'false', label: t('Key only') },
            ]}
            onChange={(value) =>
              onSearchChange({
                login: value === ANY ? undefined : value === 'true',
              })
            }
          />
        </div>
      </div>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyTitle={t('No members yet')}
        emptyDescription={t(
          'Add members or import them to start issuing keys.'
        )}
        emptyIcon={<Users />}
        skeletonKeyPrefix='enterprise-member-skeleton'
      />

      <MemberDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        member={dialog?.member}
        defaultTeamId={typeof props.team === 'number' ? props.team : 0}
        lockTeam={teamScoped}
        onSaved={refresh}
      />
      <MemberLoginDialog
        member={login}
        actor={props.actor}
        onOpenChange={(open) => !open && setLogin(null)}
        onSaved={refresh}
      />
      <TokenMutateSheet
        open={issuingKey !== null}
        onOpenChange={(open) => !open && setIssuingKey(null)}
        member={issuingKey ?? undefined}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('Delete Member')}
        desc={t(
          'The member will be removed, their API keys disabled and their console access revoked. Usage history is kept.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => void handleDelete()}
      />
    </div>
  )
}
