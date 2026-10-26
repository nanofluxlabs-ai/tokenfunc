import { useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, Trash2, UserCog } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableRowActionMenu } from '@/components/data-table'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import { archiveTeam, deleteTeam } from '../api'
import type { Team } from '../types'
import { TeamAdminDialog } from './team-admin-dialog'
import { TeamDialog } from './team-dialog'

/** 选中值：'all' 全部成员，正数为团队 id */
export type TeamSelection = 'all' | number

type TeamPanelProps = {
  teams: Team[]
  selected: TeamSelection
  onSelect: (selection: TeamSelection) => void
  /** 是否显示「全部成员」（团队角色只有本团队，不显示） */
  showAll: boolean
  /** 是否显示编辑 / 设管理员 / 归档 / 删除（企业主与企业管理员） */
  canManage: boolean
}

function TeamRow(props: {
  team: Team
  selected: TeamSelection
  canManage: boolean
  onSelect: (selection: TeamSelection) => void
  onEdit: (team: Team) => void
  onSetAdmin: (team: Team) => void
  onArchive: (team: Team) => void
  onDelete: (team: Team) => void
}) {
  const { t } = useTranslation()
  const { team } = props
  const isSelected = props.selected === team.id
  const archived = team.status === 'archived'
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-md pr-1 pl-2 text-sm',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
      )}
    >
      <button
        type='button'
        className='flex min-w-0 flex-1 flex-col py-1.5 text-left'
        aria-pressed={isSelected}
        onClick={() => props.onSelect(team.id)}
      >
        <span className='flex w-full items-center gap-2'>
          <span className={cn('truncate', archived && 'text-muted-foreground')}>
            {team.name}
          </span>
          {archived && (
            <span className='text-muted-foreground text-xs'>
              {t('Archived')}
            </span>
          )}
          <span className='text-muted-foreground ml-auto text-xs tabular-nums'>
            {team.member_count}
          </span>
        </span>
      </button>
      {props.canManage && (
        <DataTableRowActionMenu
          ariaLabel={t('Team actions')}
          icon='vertical'
          size='icon-sm'
          modal={false}
        >
          <DropdownMenuItem onClick={() => props.onEdit(team)}>
            <Pencil className='size-4' /> {t('Edit')}
          </DropdownMenuItem>
          {!archived && (
            <DropdownMenuItem onClick={() => props.onSetAdmin(team)}>
              <UserCog className='size-4' /> {t('Set team admin')}
            </DropdownMenuItem>
          )}
          {!team.is_default && !archived && (
            <DropdownMenuItem onClick={() => props.onArchive(team)}>
              <Archive className='size-4' /> {t('Archive')}
            </DropdownMenuItem>
          )}
          {!team.is_default && (
            <DropdownMenuItem
              variant='destructive'
              onClick={() => props.onDelete(team)}
            >
              <Trash2 className='size-4' /> {t('Delete')}
            </DropdownMenuItem>
          )}
        </DataTableRowActionMenu>
      )}
    </div>
  )
}

export function TeamPanel(props: TeamPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{ team?: Team } | null>(null)
  const [settingAdmin, setSettingAdmin] = useState<Team | null>(null)
  const [archiving, setArchiving] = useState<Team | null>(null)
  const [deleting, setDeleting] = useState<Team | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['enterprise', 'teams'] })
    void queryClient.invalidateQueries({ queryKey: ['enterprise', 'members'] })
    void queryClient.invalidateQueries({ queryKey: ['enterprise', 'tokens'] })
  }

  const handleArchive = async () => {
    if (!archiving) return
    try {
      const result = await archiveTeam(archiving.id)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Team archived'))
      setArchiving(null)
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const result = await deleteTeam(deleting.id)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Team deleted'))
      if (props.selected === deleting.id) props.onSelect('all')
      setDeleting(null)
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <span className='text-sm font-medium'>{t('Teams')}</span>
      <nav aria-label={t('Teams')} className='flex flex-col gap-0.5'>
        {props.showAll && (
          <button
            type='button'
            aria-pressed={props.selected === 'all'}
            className={cn(
              'w-full rounded-md px-2 py-1.5 text-left text-sm',
              props.selected === 'all'
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted'
            )}
            onClick={() => props.onSelect('all')}
          >
            {t('All Members')}
          </button>
        )}
        {props.teams.map((team) => (
          <TeamRow
            key={team.id}
            team={team}
            selected={props.selected}
            canManage={props.canManage}
            onSelect={props.onSelect}
            onEdit={(target) => setDialog({ team: target })}
            onSetAdmin={setSettingAdmin}
            onArchive={setArchiving}
            onDelete={setDeleting}
          />
        ))}
      </nav>

      <TeamDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        team={dialog?.team}
        onSaved={refresh}
      />
      <TeamAdminDialog
        team={settingAdmin}
        onOpenChange={(open) => !open && setSettingAdmin(null)}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={t('Archive Team')}
        desc={t(
          'Archived teams keep their members and usage history, but their API keys stop working and no new keys or members can be added.'
        )}
        destructive
        confirmText={t('Archive')}
        handleConfirm={() => void handleArchive()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('Delete Team')}
        desc={t('Teams that still have members or API keys cannot be deleted.')}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => void handleDelete()}
      />
    </div>
  )
}
