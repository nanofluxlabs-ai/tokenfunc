// TokenFunc 二开：渠道分组编辑器（列表式）。
// 行数据由上游 6 个分组 option + 注册表合成，每次编辑把差异字段写回表单；
// 外部（表单 reset）改动字段时按签名比对重建行。
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Reorder } from 'motion/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { getChannels } from '@/features/channels/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { AutoGroupsSection } from './auto-groups-section'
import {
  ChannelGroupRowItem,
  channelGroupFieldGridClassName,
} from './channel-group-row'
import {
  buildChannelGroupRows,
  createChannelGroupRowId,
  serializeChannelGroupRows,
  validateChannelGroupKey,
  type ChannelGroupFormValues,
  type ChannelGroupKeyError,
  type ChannelGroupRow,
} from './lib/serialization'
import { rowOrderControlsWidthClassName } from './row-order-controls'

/** 系统默认池，后端不允许删除 */
const DEFAULT_GROUP_KEY = 'default'
/** 一次拉取的渠道上限；超过则不展示精确数量 */
const CHANNEL_USAGE_PAGE_SIZE = 1000

type ChannelGroupsEditorProps = {
  values: ChannelGroupFormValues
  onChange: (field: keyof ChannelGroupFormValues, value: string) => void
  /** 行 key 校验结果变化时通知上层，用于禁用保存按钮 */
  onValidityChange: (valid: boolean) => void
  autoOpen: boolean
  onAutoOpenChange: (open: boolean) => void
  defaultUseAutoGroupField: ReactNode
  maxTokenAutoGroupsField: ReactNode
}

export function ChannelGroupsEditor(props: ChannelGroupsEditorProps) {
  const { t } = useTranslation()
  const values = props.values
  const [rows, setRows] = useState<ChannelGroupRow[]>(() =>
    buildChannelGroupRows(values)
  )
  const [pendingDelete, setPendingDelete] = useState<ChannelGroupRow | null>(
    null
  )

  // 表单字段被外部改动（reset）时重建行；自己写回的改动序列化后无差异，不重建
  useEffect(() => {
    setRows((current) => {
      const diff = serializeChannelGroupRows(current, values)
      return Object.keys(diff).length === 0
        ? current
        : buildChannelGroupRows(values)
    })
  }, [values])

  const onChange = props.onChange
  const emitRows = useCallback(
    (next: ChannelGroupRow[]) => {
      setRows(next)
      const diff = serializeChannelGroupRows(next, values)
      for (const [field, json] of Object.entries(diff)) {
        onChange(field as keyof ChannelGroupFormValues, json)
      }
    },
    [onChange, values]
  )

  const keyErrors = useMemo(() => {
    const errors = new Map<string, ChannelGroupKeyError | null>()
    for (const row of rows) {
      const otherKeys = rows
        .filter((other) => other.id !== row.id)
        .map((other) => other.key.trim())
      errors.set(row.id, validateChannelGroupKey(row.key, otherKeys))
    }
    return errors
  }, [rows])
  const hasInvalidRows = [...keyErrors.values()].some((error) => error !== null)

  const onValidityChange = props.onValidityChange
  useEffect(() => {
    onValidityChange(!hasInvalidRows)
  }, [hasInvalidRows, onValidityChange])

  const updateRow = useCallback(
    (id: string, patch: Partial<ChannelGroupRow>) => {
      emitRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    },
    [emitRows, rows]
  )

  const moveRow = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= rows.length) return
      const next = [...rows]
      ;[next[index], next[target]] = [next[target], next[index]]
      emitRows(next)
    },
    [emitRows, rows]
  )

  const reorderRows = useCallback(
    (ids: string[]) => {
      const byId = new Map(rows.map((row) => [row.id, row]))
      const next = ids
        .map((id) => byId.get(id))
        .filter((row): row is ChannelGroupRow => row !== undefined)
      if (next.length !== rows.length) return
      emitRows(next)
    },
    [emitRows, rows]
  )

  const addRow = useCallback(() => {
    emitRows([
      ...rows,
      {
        id: createChannelGroupRowId(),
        key: '',
        label: '',
        ratio: '1',
        topupRatio: '',
        defaultVisible: true,
        isNew: true,
      },
    ])
  }, [emitRows, rows])

  const requestDelete = useCallback(
    (row: ChannelGroupRow) => {
      // 尚未保存过的新行直接移除，不需要确认
      if (row.isNew) {
        emitRows(rows.filter((item) => item.id !== row.id))
        return
      }
      setPendingDelete(row)
    },
    [emitRows, rows]
  )

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    emitRows(rows.filter((row) => row.id !== pendingDelete.id))
    setPendingDelete(null)
  }, [emitRows, pendingDelete, rows])

  // 只在打开删除确认时拉渠道列表，用于提示「仍有 N 个渠道在用」
  const channelUsageQuery = useQuery({
    queryKey: ['channels', 'tokenfunc-group-usage'],
    queryFn: async () =>
      requireServerSuccess(
        await getChannels({ p: 1, page_size: CHANNEL_USAGE_PAGE_SIZE })
      ),
    enabled: pendingDelete !== null,
    staleTime: 60 * 1000,
    meta: { errorToast: false },
  })
  const channelUsageCount = useMemo(() => {
    const data = channelUsageQuery.data?.data
    if (!pendingDelete || !data) return null
    if (data.total > data.items.length) return null
    const key = pendingDelete.key
    return data.items.filter((channel) =>
      (channel.group ?? '')
        .split(',')
        .map((item) => item.trim())
        .includes(key)
    ).length
  }, [channelUsageQuery.data, pendingDelete])

  // 自动分组候选：只保留 key 合法的行，附带基准倍率供行内徽章展示
  const autoGroupCandidates = useMemo(
    () =>
      rows
        .filter((row) => keyErrors.get(row.id) === null)
        .map((row) => ({ key: row.key.trim(), ratio: row.ratio })),
    [rows, keyErrors]
  )

  const headerCellClassName = 'text-muted-foreground text-xs font-medium'

  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Each channel group is a pool of channels with its own base ratio. Drag to change the order shown to users.'
          )}
        </p>
        <Button type='button' size='sm' onClick={addRow}>
          <Plus className='mr-2 h-4 w-4' aria-hidden='true' />
          {t('Add channel group')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className='min-h-40'
          title={t('No groups yet. Add a group to get started.')}
        />
      ) : (
        <div className='flex min-w-0 flex-col gap-2'>
          <div
            data-slot='channel-group-header'
            className='hidden items-center gap-2 px-2 sm:flex'
            aria-hidden='true'
          >
            <div className={channelGroupFieldGridClassName}>
              <span className={headerCellClassName}>{t('Group key')}</span>
              <span className={headerCellClassName}>{t('Name')}</span>
              <span className={headerCellClassName}>{t('Ratio')}</span>
              <span className={headerCellClassName}>{t('Top-up ratio')}</span>
              <span className={`${headerCellClassName} text-center`}>
                {t('Default visible')}
              </span>
            </div>
            <div className={`${rowOrderControlsWidthClassName} shrink-0`} />
          </div>
          <Reorder.Group
            as='ol'
            axis='y'
            values={rows.map((row) => row.id)}
            onReorder={reorderRows}
            aria-label={t('Channel groups')}
            className='flex flex-col gap-2'
          >
            {rows.map((row, index) => (
              <ChannelGroupRowItem
                key={row.id}
                row={row}
                index={index}
                count={rows.length}
                keyError={keyErrors.get(row.id) ?? null}
                deletable={row.key !== DEFAULT_GROUP_KEY}
                onUpdate={updateRow}
                onMove={moveRow}
                onDelete={requestDelete}
              />
            ))}
          </Reorder.Group>
          {hasInvalidRows && (
            <p className='text-destructive text-sm' role='alert'>
              {t('Fix invalid group keys before saving.')}
            </p>
          )}
        </div>
      )}

      <AutoGroupsSection
        open={props.autoOpen}
        onOpenChange={props.onAutoOpenChange}
        autoGroups={values.AutoGroups}
        channelGroups={autoGroupCandidates}
        onAutoGroupsChange={(json) => onChange('AutoGroups', json)}
        defaultUseAutoGroupField={props.defaultUseAutoGroupField}
        maxTokenAutoGroupsField={props.maxTokenAutoGroupsField}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={t('Delete channel group {{group}}?', {
          group: pendingDelete?.key ?? '',
        })}
        desc={
          <div className='space-y-2'>
            <p>
              {t(
                'Its ratios, visibility rules and auto group entry are removed after saving.'
              )}
            </p>
            {channelUsageCount !== null && channelUsageCount > 0 && (
              <p className='text-destructive font-medium'>
                {t('{{count}} channels still use this group.', {
                  count: channelUsageCount,
                })}
              </p>
            )}
            <p>
              {t(
                'Make sure no channel or API key still uses this group before deleting.'
              )}
            </p>
          </div>
        }
        destructive
        confirmText={t('Delete')}
        handleConfirm={confirmDelete}
      />
    </div>
  )
}
