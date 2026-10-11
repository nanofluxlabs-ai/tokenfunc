import { Copy, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { QuoteConfigEditorProps, QuoteModel } from '../../types'
import { ImagePricingCard } from './image-pricing-card'
import { ModelDialog } from './model-dialog'
import { OptionSelect } from './option-select'

type ModelRow = QuoteModel & { index: number }

/** 模型官方价维护：分组筛选 + 新增 / 编辑 / 复制 / 删除；下方是图片计费附表 */
export function ModelsEditor(props: QuoteConfigEditorProps) {
  const { t } = useTranslation()
  const [groupFilter, setGroupFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  // editingIndex 为 undefined 表示新增（含复制预填）
  const [editingIndex, setEditingIndex] = useState<number | undefined>()
  const [preset, setPreset] = useState<QuoteModel | undefined>()
  const [deleting, setDeleting] = useState<ModelRow | undefined>()

  const groups = useMemo(
    () => [...props.config.groups].sort((a, b) => a.order - b.order),
    [props.config.groups]
  )
  const groupOptions = groups.map((g) => ({
    value: g.key,
    label: g.short_name || g.name,
  }))
  const groupLabel = (key: string) =>
    groupOptions.find((option) => option.value === key)?.label ?? key

  const rows = useMemo<ModelRow[]>(
    () =>
      props.config.models
        .map((model, index) => ({ ...model, index }))
        .filter((row) => groupFilter === '' || row.group_key === groupFilter),
    [props.config.models, groupFilter]
  )

  const openCreate = (base?: QuoteModel) => {
    setEditingIndex(undefined)
    setPreset(base)
    setDialogOpen(true)
  }
  const openEdit = (row: ModelRow) => {
    const { index, ...model } = row
    setEditingIndex(index)
    setPreset(model)
    setDialogOpen(true)
  }
  const openCopy = (row: ModelRow) => {
    const { index: _index, ...model } = row
    openCreate({ ...model, name: '', id: '' })
  }

  const handleSubmit = async (model: QuoteModel) => {
    const models = [...props.config.models]
    if (editingIndex === undefined) {
      models.push(model)
    } else {
      models[editingIndex] = model
    }
    return props.onSave({ ...props.config, models })
  }

  const handleDelete = async () => {
    if (!deleting) return
    const ok = await props.onSave({
      ...props.config,
      models: props.config.models.filter(
        (_, index) => index !== deleting.index
      ),
    })
    if (ok) setDeleting(undefined)
  }

  const price = (value: number) => (value ? `$${value}` : '—')
  const columns: StaticDataTableColumn<ModelRow>[] = [
    { id: 'name', header: t('Display name'), cell: (row) => row.name },
    {
      id: 'id',
      header: t('Model ID'),
      cell: (row) => <code className='text-xs'>{row.id}</code>,
    },
    {
      id: 'group',
      header: t('Group'),
      cell: (row) => (
        <Badge variant='outline'>{groupLabel(row.group_key)}</Badge>
      ),
    },
    {
      id: 'subgroup',
      header: t('Subgroup'),
      cell: (row) => (row.subgroup === 'codex' ? 'Codex' : t('Standard')),
    },
    { id: 'context', header: 'Context', cell: (row) => row.context_window },
    {
      id: 'input',
      header: t('Input price'),
      cell: (row) => price(row.input_price),
    },
    {
      id: 'output',
      header: t('Output price'),
      cell: (row) => price(row.output_price),
    },
    {
      id: 'cache',
      header: t('Cache read'),
      cell: (row) => price(row.cache_read),
    },
    {
      id: 'actions',
      header: '',
      className: 'w-32',
      cell: (row) => (
        <div className='flex justify-end gap-1'>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Copy')}
            onClick={() => openCopy(row)}
          >
            <Copy />
          </Button>
          <StaticRowActions
            editLabel={t('Edit')}
            deleteLabel={t('Delete')}
            menuLabel={t('Open menu')}
            onEdit={() => openEdit(row)}
            onDelete={() => setDeleting(row)}
          />
        </div>
      ),
    },
  ]

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-3'>
        <OptionSelect
          value={groupFilter}
          onChange={setGroupFilter}
          options={[{ value: '', label: t('All groups') }, ...groupOptions]}
          className='w-48'
          aria-label={t('Group')}
        />
        <Button size='sm' onClick={() => openCreate()}>
          <Plus className='h-4 w-4' />
          {t('Add model')}
        </Button>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Official prices are USD per 1M tokens; a cache price of 0 means the model has no separate cache pricing.'
          )}
        </p>
      </div>

      <StaticDataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.index}
        emptyContent={t('No models yet')}
      />

      <ImagePricingCard {...props} />

      <ModelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isEdit={editingIndex !== undefined}
        preset={preset}
        groupOptions={groupOptions}
        defaultGroupKey={groupFilter || groups[0]?.key || ''}
        saving={props.saving}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined)
        }}
        title={t('Delete model "{{name}}"?', { name: deleting?.name ?? '' })}
        desc={t('The model will be removed from the quote.')}
        destructive
        confirmText={t('Delete')}
        isLoading={props.saving}
        handleConfirm={() => void handleDelete()}
      />
    </div>
  )
}
