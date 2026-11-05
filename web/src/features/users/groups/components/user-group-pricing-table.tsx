// TokenFunc 二开：某个用户分组自己的「可用渠道分组」有序列表，纯展示组件。
// 定价抽屉（用户管理 › 用户分组）与系统设置 › 分组定价 的面板共用。
// rows 是完整数组（可见在前、不可见在后）：可见行按顺序列出可排序、改倍率、移除；
// 不可见行是「添加渠道分组」弹窗（AddChannelGroupButton）的候选，由调用方把按钮放在标题区。
import { Reorder, useDragControls } from 'motion/react'
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  RowOrderControls,
  rowOrderControlsWidthClassName,
} from '@/features/system-settings/models/channel-groups/row-order-controls'
import { translateServerText } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  isRatioInvalid,
  parseRatioText,
  type PricingRowView,
} from '../lib/user-group-pricing'

type UserGroupPricingTableProps = {
  rows: PricingRowView[]
  /** 任一格改动后回传整张表的新行：可见行按当前顺序在前，不可见行在后 */
  onChange: (rows: PricingRowView[]) => void
  disabled?: boolean
}

/** 字段区的网格列定义，表头与每一行共用：名称 · 基准 · 倍率 · 最终 */
const fieldGridClassName =
  'grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_5rem] sm:items-center'

type PricingRowItemProps = {
  row: PricingRowView
  label: string
  index: number
  count: number
  disabled: boolean
  onRatioChange: (row: PricingRowView, ratioText: string) => void
  onMove: (index: number, direction: 'up' | 'down') => void
  onRemove: (row: PricingRowView) => void
}

function PricingRowItem(props: PricingRowItemProps) {
  const { t } = useTranslation()
  const dragControls = useDragControls()
  const baseId = useId()
  const row = props.row
  const override = parseRatioText(row.ratioText)
  const mobileLabelClassName = 'text-xs sm:sr-only'

  return (
    <Reorder.Item
      value={row.channel_group}
      dragListener={false}
      dragMomentum={false}
      dragControls={dragControls}
      data-slot='user-group-pricing-row'
      className='bg-background relative flex min-w-0 flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center'
    >
      <div className={fieldGridClassName}>
        <div className='flex min-w-0 flex-col gap-1'>
          <span className={mobileLabelClassName}>{t('Channel group')}</span>
          <span
            className='truncate text-sm font-medium sm:leading-8'
            title={row.channel_group}
          >
            {props.label}
          </span>
        </div>
        <div className='flex min-w-0 flex-col gap-1'>
          <span className={mobileLabelClassName}>{t('Base')}</span>
          <span className='font-mono text-sm tabular-nums sm:leading-8'>
            {row.base_ratio}x
          </span>
        </div>
        <div className='flex min-w-0 flex-col gap-1'>
          <Label htmlFor={`${baseId}-ratio`} className={mobileLabelClassName}>
            {t('Ratio')}
          </Label>
          <Input
            id={`${baseId}-ratio`}
            type='number'
            min={0}
            step={0.01}
            inputMode='decimal'
            value={row.ratioText}
            placeholder={String(row.base_ratio)}
            disabled={props.disabled}
            aria-invalid={isRatioInvalid(row) || undefined}
            aria-label={t('Ratio override for {{group}}', {
              group: props.label,
            })}
            className='font-mono tabular-nums'
            onChange={(event) => props.onRatioChange(row, event.target.value)}
          />
        </div>
        <div className='flex min-w-0 flex-col gap-1'>
          <span className={mobileLabelClassName}>{t('Effective')}</span>
          <span
            className={cn(
              'font-mono text-sm tabular-nums sm:leading-8',
              override === null && 'text-muted-foreground'
            )}
          >
            {override ?? row.base_ratio}x
          </span>
        </div>
      </div>
      {/* locked：用户分组 key 本身就是这个渠道分组，上游总把它算作可见，不能移出 */}
      <RowOrderControls
        className='justify-end border-t pt-2 sm:border-t-0 sm:pt-0'
        name={props.label}
        index={props.index}
        count={props.count}
        dragControls={dragControls}
        onMove={props.onMove}
        onRemove={() => props.onRemove(row)}
        removeDisabled={props.disabled || row.locked}
        removeTitle={
          row.locked ? t('Always visible to its own user group') : undefined
        }
        removeIcon='cancel'
      />
    </Reorder.Item>
  )
}

export function UserGroupPricingTable(props: UserGroupPricingTableProps) {
  const { t } = useTranslation()
  const disabled = props.disabled ?? false

  const labelOf = (row: PricingRowView) =>
    translateServerText(t, row.label) || row.channel_group

  const { visibleRows, hiddenRows } = useMemo(
    () => ({
      visibleRows: props.rows.filter((row) => row.visible),
      hiddenRows: props.rows.filter((row) => !row.visible),
    }),
    [props.rows]
  )

  const emit = (
    nextVisible: PricingRowView[],
    nextHidden: PricingRowView[] = hiddenRows
  ) => props.onChange([...nextVisible, ...nextHidden])

  const handleReorder = (keys: string[]) => {
    const byKey = new Map(visibleRows.map((row) => [row.channel_group, row]))
    emit(keys.flatMap((key) => byKey.get(key) ?? []))
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= visibleRows.length) return
    const next = [...visibleRows]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    emit(next)
  }

  const handleRatioChange = (target: PricingRowView, ratioText: string) => {
    emit(
      visibleRows.map((row) =>
        row.channel_group === target.channel_group ? { ...row, ratioText } : row
      )
    )
  }

  // 移除 = 不可见且倍率清空，回到候选里
  const handleRemove = (target: PricingRowView) => {
    emit(
      visibleRows.filter((row) => row.channel_group !== target.channel_group),
      [...hiddenRows, { ...target, visible: false, ratioText: '' }]
    )
  }

  const headerCellClassName = 'text-muted-foreground text-xs font-medium'

  return (
    <div className='flex min-w-0 flex-col gap-3'>
      {visibleRows.length === 0 ? (
        <p className='text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm'>
          {t('No channel groups')}
        </p>
      ) : (
        <div className='flex min-w-0 flex-col gap-2'>
          <div
            className='hidden items-center gap-2 px-2 sm:flex'
            aria-hidden='true'
          >
            <div className={fieldGridClassName}>
              <span className={headerCellClassName}>{t('Channel group')}</span>
              <span className={headerCellClassName}>{t('Base')}</span>
              <span className={headerCellClassName}>{t('Ratio')}</span>
              <span className={headerCellClassName}>{t('Effective')}</span>
            </div>
            <div className={`${rowOrderControlsWidthClassName} shrink-0`} />
          </div>
          <Reorder.Group
            as='ol'
            axis='y'
            values={visibleRows.map((row) => row.channel_group)}
            onReorder={handleReorder}
            aria-label={t('Channel groups')}
            className='flex flex-col gap-2'
          >
            {visibleRows.map((row, index) => (
              <PricingRowItem
                key={row.channel_group}
                row={row}
                label={labelOf(row)}
                index={index}
                count={visibleRows.length}
                disabled={disabled}
                onRatioChange={handleRatioChange}
                onMove={handleMove}
                onRemove={handleRemove}
              />
            ))}
          </Reorder.Group>
        </div>
      )}
    </div>
  )
}
