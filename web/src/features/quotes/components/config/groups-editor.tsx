import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { QuoteConfigEditorProps, QuoteGroup } from '../../types'
import { GroupDialog } from './group-dialog'

/** 供应商分组：新增分组 → 在「模型价格」加模型 → 生成即出新章节 */
export function GroupsEditor(props: QuoteConfigEditorProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<QuoteGroup | undefined>()
  const [deleting, setDeleting] = useState<QuoteGroup | undefined>()

  const groups = useMemo(
    () => [...props.config.groups].sort((a, b) => a.order - b.order),
    [props.config.groups]
  )

  const openCreate = () => {
    setEditing(undefined)
    setDialogOpen(true)
  }
  const openEdit = (group: QuoteGroup) => {
    setEditing(group)
    setDialogOpen(true)
  }

  const handleSubmit = async (group: QuoteGroup) => {
    const isCreate = editing === undefined
    if (isCreate && groups.some((g) => g.key === group.key)) {
      toast.error(t('Group key already exists: {{key}}', { key: group.key }))
      return false
    }
    const next = isCreate
      ? [...props.config.groups, group]
      : props.config.groups.map((g) => (g.key === editing.key ? group : g))
    return props.onSave({ ...props.config, groups: next })
  }

  const requestDelete = (group: QuoteGroup) => {
    const used = props.config.models.filter((m) => m.group_key === group.key)
    if (used.length > 0) {
      toast.error(
        t(
          'Group "{{name}}" still has {{n}} models. Move or delete them under "Model prices" first.',
          { name: group.name, n: used.length }
        )
      )
      return
    }
    setDeleting(group)
  }

  const handleDelete = async () => {
    if (!deleting) return
    const ok = await props.onSave({
      ...props.config,
      groups: props.config.groups.filter((g) => g.key !== deleting.key),
    })
    if (ok) setDeleting(undefined)
  }

  const columns: StaticDataTableColumn<QuoteGroup>[] = [
    { id: 'order', header: t('Order'), cell: (row) => row.order },
    {
      id: 'key',
      header: t('Group key'),
      cell: (row) => <Badge variant='outline'>{row.key}</Badge>,
    },
    {
      id: 'short_name',
      header: t('Short name'),
      cell: (row) => row.short_name,
    },
    { id: 'name', header: t('Section title'), cell: (row) => row.name },
    {
      id: 'default_discount',
      header: t('Default discount'),
      cell: (row) => `${row.default_discount}%`,
    },
    {
      id: 'render_type',
      header: t('Table style'),
      cell: (row) =>
        row.render_type === 'cache_table' ? t('Claude style') : t('Simple'),
    },
    {
      id: 'actions',
      header: '',
      className: 'w-24',
      cell: (row) => (
        <StaticRowActions
          editLabel={t('Edit')}
          deleteLabel={t('Delete')}
          menuLabel={t('Open menu')}
          onEdit={() => openEdit(row)}
          onDelete={() => requestDelete(row)}
        />
      ),
    },
  ]

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-3'>
        <Button size='sm' onClick={openCreate}>
          <Plus className='h-4 w-4' />
          {t('Add group')}
        </Button>
        <p className='text-muted-foreground text-sm'>
          {t(
            'To add a vendor (e.g. Gemini): create a group, add its models under "Model prices", then generate.'
          )}
        </p>
      </div>

      <StaticDataTable
        columns={columns}
        data={groups}
        getRowKey={(row) => row.key}
        emptyContent={t('No groups yet')}
      />

      <GroupDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        group={editing}
        nextOrder={(groups.at(-1)?.order ?? 0) + 1}
        saving={props.saving}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined)
        }}
        title={t('Delete group "{{name}}"?', { name: deleting?.name ?? '' })}
        desc={t('The quote will no longer include this section.')}
        destructive
        confirmText={t('Delete')}
        isLoading={props.saving}
        handleConfirm={() => void handleDelete()}
      />
    </div>
  )
}
