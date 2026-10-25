import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { KeyRound, Pencil, Plus, Trash2, Upload, UserCog } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/use-debounce'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { deleteMember, listMembers } from '../api'
import {
  canManageMembers,
  isTeamScoped,
  MEMBER_ROLE_LABELS,
} from '../lib/member-roles'
import type { EnterpriseActor, Member } from '../types'
import { MemberDialog } from './member-dialog'
import { MemberImportDialog } from './member-import-dialog'
import { MemberLoginDialog } from './member-login-dialog'
import type { TeamSelection } from './team-panel'
import { TokenCreateDialog } from './token-create-dialog'

const PAGE_SIZE = 20

export function MembersSection(props: {
  team: TeamSelection
  actor: EnterpriseActor | null | undefined
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 400)
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<{ member?: Member } | null>(null)
  const [login, setLogin] = useState<Member | null>(null)
  const [issuingKey, setIssuingKey] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState<Member | null>(null)
  const [importing, setImporting] = useState(false)
  const manage = canManageMembers(props.actor)
  const teamScoped = isTeamScoped(props.actor)

  const teamId = props.team === 'all' ? undefined : props.team
  const { data, isLoading } = useQuery({
    queryKey: ['enterprise', 'members', teamId, debouncedKeyword, page],
    queryFn: async () =>
      requireServerSuccess(
        await listMembers({
          team_id: teamId,
          keyword: debouncedKeyword || undefined,
          p: page,
          page_size: PAGE_SIZE,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

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

  const columns: StaticDataTableColumn<Member>[] = [
    {
      id: 'name',
      header: t('Name'),
      cell: (row) => (
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
      cell: (row) => row.employee_no || '—',
    },
    {
      id: 'team',
      header: t('Team'),
      cell: (row) => row.team_name || '—',
    },
    {
      id: 'login',
      header: t('Console access'),
      cell: (row) =>
        row.user_id > 0 ? (
          <div className='flex flex-col'>
            <span>{row.username}</span>
            <span className='text-muted-foreground text-xs'>
              {t(MEMBER_ROLE_LABELS[row.role])}
            </span>
          </div>
        ) : (
          <span className='text-muted-foreground'>{t('No login')}</span>
        ),
    },
    {
      id: 'token_count',
      header: t('API Keys'),
      cell: (row) =>
        row.token_count > 0 ? (
          <Link
            to='/enterprise/keys'
            search={{ member_id: row.id }}
            className='underline-offset-4 hover:underline'
          >
            {row.token_count}
          </Link>
        ) : (
          <span className='text-muted-foreground'>0</span>
        ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => (
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
      cell: (row) => (
        <div className='flex gap-1'>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Issue API Key')}
            disabled={row.status !== 'active'}
            onClick={() => setIssuingKey(row)}
          >
            <KeyRound />
          </Button>
          {manage && (
            <>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('Console access')}
                onClick={() => setLogin(row)}
              >
                <UserCog />
              </Button>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('Edit')}
                onClick={() => setDialog({ member: row })}
              >
                <Pencil />
              </Button>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('Delete')}
                onClick={() => setDeleting(row)}
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className='flex min-w-0 flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='max-w-xs'
          placeholder={t('Search name, email or employee No....')}
          aria-label={t('Search members')}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            setPage(1)
          }}
        />
        <div className='flex-1' />
        {manage && (
          <>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setImporting(true)}
            >
              <Upload className='h-4 w-4' />
              {t('Import CSV')}
            </Button>
            <Button size='sm' onClick={() => setDialog({})}>
              <Plus className='h-4 w-4' />
              {t('Add Member')}
            </Button>
          </>
        )}
      </div>
      <StaticDataTable
        columns={columns}
        data={data?.items ?? []}
        getRowKey={(row) => row.id}
        empty={!isLoading && (data?.items.length ?? 0) === 0}
        emptyContent={t('No members yet')}
      />
      <div className='text-muted-foreground flex items-center justify-end gap-2 text-sm'>
        <span>{t('Total: {{count}}', { count: total })}</span>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
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
          onClick={() => setPage(page + 1)}
        >
          {t('Next')}
        </Button>
      </div>

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
      <TokenCreateDialog
        open={issuingKey !== null}
        onOpenChange={(open) => !open && setIssuingKey(null)}
        member={issuingKey ?? undefined}
        onCreated={refresh}
      />
      <MemberImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImported={refresh}
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
