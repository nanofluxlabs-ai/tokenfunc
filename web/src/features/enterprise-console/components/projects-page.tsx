import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { deleteProject, listProjects } from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import type { Project } from '../types'
import { EnterpriseGuard } from './enterprise-guard'
import { ProjectDialog } from './project-dialog'

function ProjectsTable(props: { onEdit: (project: Project) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState<Project | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['enterprise', 'projects'],
    queryFn: async () =>
      requireServerSuccess(await listProjects({})).data ?? [],
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['enterprise', 'projects'] })
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const result = await deleteProject(deleting.id)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Project deleted'))
      setDeleting(null)
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  const columns: StaticDataTableColumn<Project>[] = [
    {
      id: 'name',
      header: t('Project Name'),
      cell: (row) => <span className='font-medium'>{row.name}</span>,
    },
    { id: 'code', header: t('Project Code'), cell: (row) => row.code || '—' },
    {
      id: 'token_count',
      header: t('API Keys'),
      cell: (row) => row.token_count,
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => (
        <StatusBadge
          label={row.status === 'active' ? t('Active') : t('Archived')}
          variant={row.status === 'active' ? 'success' : 'neutral'}
          copyable={false}
        />
      ),
    },
    {
      id: 'created_at',
      header: t('Created'),
      cell: (row) => formatTimestampToDate(row.created_at),
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (row) => (
        <div className='flex gap-1'>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Edit')}
            onClick={() => props.onEdit(row)}
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
        </div>
      ),
    },
  ]

  return (
    <>
      <StaticDataTable
        columns={columns}
        data={data ?? []}
        getRowKey={(row) => row.id}
        empty={!isLoading && (data?.length ?? 0) === 0}
        emptyContent={t('No projects yet')}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('Delete Project')}
        desc={t(
          'The project will be removed. API keys keep their usage history.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => void handleDelete()}
      />
    </>
  )
}

export function EnterpriseProjects() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: enterprise } = useEnterpriseSelf()
  const [dialog, setDialog] = useState<{ project?: Project } | null>(null)
  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Projects')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          {enterprise && (
            <Button size='sm' onClick={() => setDialog({})}>
              <Plus className='h-4 w-4' />
              {t('Add Project')}
            </Button>
          )}
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <EnterpriseGuard>
            <ProjectsTable onEdit={(project) => setDialog({ project })} />
          </EnterpriseGuard>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <ProjectDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        project={dialog?.project}
        onSaved={() =>
          void queryClient.invalidateQueries({
            queryKey: ['enterprise', 'projects'],
          })
        }
      />
    </>
  )
}
