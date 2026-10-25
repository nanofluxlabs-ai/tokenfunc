import { useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import { archiveTeam, deleteTeam } from '../api'
import type { Team } from '../types'
import { TeamDialog } from './team-dialog'

/** 选中值：'all' 全部成员，正数为团队 id */
export type TeamSelection = 'all' | number

type TeamPanelProps = {
  teams: Team[]
  selected: TeamSelection
  onSelect: (selection: TeamSelection) => void
  /** 是否显示新建 / 编辑 / 归档 / 删除（企业主与企业管理员） */
  canManage: boolean
}

function TeamRow(props: {
  team: Team
  selected: TeamSelection
  canManage: boolean
  onSelect: (selection: TeamSelection) => void
  onEdit: (team: Team) => void
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
        className='flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left'
        aria-pressed={isSelected}
        onClick={() => props.onSelect(team.id)}
      >
        <span className={cn('truncate', archived && 'text-muted-foreground')}>
          {team.name}
        </span>
        {archived && (
          <span className='text-muted-foreground text-xs'>{t('Archived')}</span>
        )}
        <span className='text-muted-foreground ml-auto text-xs tabular-nums'>
          {team.member_count}
        </span>
      </button>
      {props.canManage && (
        <div className='flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Edit')}
            onClick={() => props.onEdit(team)}
          >
            <Pencil />
          </Button>
          {!team.is_default && !archived && (
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('Archive')}
              onClick={() => props.onArchive(team)}
            >
              <Archive />
            </Button>
          )}
          {!team.is_default && (
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('Delete')}
              onClick={() => props.onDelete(team)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function TeamPanel(props: TeamPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{ team?: Team } | null>(null)
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
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>{t('Teams')}</span>
        {props.canManage && (
          <Button variant='outline' size='sm' onClick={() => setDialog({})}>
            <Plus className='h-4 w-4' />
            {t('Add Team')}
          </Button>
        )}
      </div>
      <nav aria-label={t('Teams')} className='flex flex-col gap-0.5'>
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
        {props.teams.map((team) => (
          <TeamRow
            key={team.id}
            team={team}
            selected={props.selected}
            canManage={props.canManage}
            onSelect={props.onSelect}
            onEdit={(target) => setDialog({ team: target })}
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
