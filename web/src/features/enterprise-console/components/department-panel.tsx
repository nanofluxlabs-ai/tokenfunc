import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import { deleteDepartment } from '../api'
import type { DepartmentNode } from '../types'
import { DepartmentDialog } from './department-dialog'

/** 选中值：'all' 全部员工，0 未分配部门，正数为部门 id */
export type DepartmentSelection = 'all' | number

type DepartmentPanelProps = {
  tree: DepartmentNode[]
  selected: DepartmentSelection
  onSelect: (selection: DepartmentSelection) => void
}

function DepartmentRow(props: {
  node: DepartmentNode
  selected: DepartmentSelection
  onSelect: (selection: DepartmentSelection) => void
  onEdit: (node: DepartmentNode) => void
  onAddChild: (node: DepartmentNode) => void
  onDelete: (node: DepartmentNode) => void
}) {
  const { t } = useTranslation()
  const isSelected = props.selected === props.node.id
  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md pr-1 text-sm',
          isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
        )}
        style={{ paddingLeft: `${props.node.depth * 16 + 8}px` }}
      >
        <button
          type='button'
          className='min-w-0 flex-1 truncate py-1.5 text-left'
          aria-pressed={isSelected}
          onClick={() => props.onSelect(props.node.id)}
        >
          {props.node.name}
        </button>
        <div className='flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Add Sub-department')}
            onClick={() => props.onAddChild(props.node)}
          >
            <Plus />
          </Button>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Edit')}
            onClick={() => props.onEdit(props.node)}
          >
            <Pencil />
          </Button>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Delete')}
            onClick={() => props.onDelete(props.node)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {props.node.children.map((child) => (
        <DepartmentRow key={child.id} {...props} node={child} />
      ))}
    </>
  )
}

export function DepartmentPanel(props: DepartmentPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{
    department?: DepartmentNode
    parentId?: number
  } | null>(null)
  const [deleting, setDeleting] = useState<DepartmentNode | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ['enterprise', 'departments'],
    })
    void queryClient.invalidateQueries({
      queryKey: ['enterprise', 'employees'],
    })
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const result = await deleteDepartment(deleting.id)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Department deleted'))
      if (props.selected === deleting.id) props.onSelect('all')
      setDeleting(null)
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  const fixedItem = (selection: DepartmentSelection, label: string) => (
    <button
      type='button'
      aria-pressed={props.selected === selection}
      className={cn(
        'w-full rounded-md px-2 py-1.5 text-left text-sm',
        props.selected === selection
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted'
      )}
      onClick={() => props.onSelect(selection)}
    >
      {label}
    </button>
  )

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>{t('Departments')}</span>
        <Button variant='outline' size='sm' onClick={() => setDialog({})}>
          <Plus className='h-4 w-4' />
          {t('Add Department')}
        </Button>
      </div>
      <nav aria-label={t('Departments')} className='flex flex-col gap-0.5'>
        {fixedItem('all', t('All Employees'))}
        {fixedItem(0, t('Unassigned'))}
        {props.tree.map((node) => (
          <DepartmentRow
            key={node.id}
            node={node}
            selected={props.selected}
            onSelect={props.onSelect}
            onEdit={(department) => setDialog({ department })}
            onAddChild={(parent) => setDialog({ parentId: parent.id })}
            onDelete={setDeleting}
          />
        ))}
      </nav>

      <DepartmentDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        tree={props.tree}
        department={dialog?.department}
        defaultParentId={dialog?.parentId}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('Delete Department')}
        desc={t(
          'Departments with sub-departments or employees cannot be deleted.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => void handleDelete()}
      />
    </div>
  )
}
