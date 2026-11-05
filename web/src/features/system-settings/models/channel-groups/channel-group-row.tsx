// TokenFunc 二开：渠道分组列表里的一行。
// 桌面端为一行网格：key · 名称 · 基准倍率 · 充值倍率 · 默认可见 · 操作组（上 / 下 / 把手 / 删除）；
// 手机端（<sm）字段纵排成卡片，每个字段显示自己的标签，操作组放在卡片底部。
import { Reorder, useDragControls } from 'motion/react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import type { ChannelGroupKeyError, ChannelGroupRow } from './lib/serialization'
import { RowOrderControls } from './row-order-controls'

/** 字段区的网格列定义，表头与每一行共用，保证对齐 */
export const channelGroupFieldGridClassName =
  'grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_6rem_6rem_5rem] sm:items-center'

type ChannelGroupRowItemProps = {
  row: ChannelGroupRow
  index: number
  count: number
  keyError: ChannelGroupKeyError | null
  /** default 分组是系统默认池，不允许删除 */
  deletable: boolean
  onUpdate: (id: string, patch: Partial<ChannelGroupRow>) => void
  onMove: (index: number, direction: 'up' | 'down') => void
  onDelete: (row: ChannelGroupRow) => void
}

function keyErrorMessage(
  t: (key: string) => string,
  error: ChannelGroupKeyError | null
): string | null {
  if (error === 'required') return t('Group key is required')
  if (error === 'pattern') {
    return t('Use lowercase letters, digits, underscore or hyphen')
  }
  if (error === 'duplicate') return t('Duplicate group key')
  return null
}

export function ChannelGroupRowItem(props: ChannelGroupRowItemProps) {
  const { t } = useTranslation()
  const dragControls = useDragControls()
  const baseId = useId()
  const row = props.row
  const displayName = row.key.trim() || t('New channel group')
  const errorMessage = keyErrorMessage(t, props.keyError)
  const mobileLabelClassName = 'text-xs sm:sr-only'

  return (
    <Reorder.Item
      value={row.id}
      dragListener={false}
      dragMomentum={false}
      dragControls={dragControls}
      data-slot='channel-group-row'
      className='bg-background relative flex min-w-0 flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center'
    >
      <div className={channelGroupFieldGridClassName}>
        <div className='flex min-w-0 flex-col gap-1'>
          <Label htmlFor={`${baseId}-key`} className={mobileLabelClassName}>
            {t('Group key')}
          </Label>
          {row.isNew ? (
            <>
              <Input
                id={`${baseId}-key`}
                value={row.key}
                placeholder='gptpro'
                autoComplete='off'
                spellCheck={false}
                className='font-mono'
                aria-invalid={props.keyError !== null}
                aria-describedby={
                  errorMessage ? `${baseId}-key-error` : undefined
                }
                onChange={(event) =>
                  props.onUpdate(row.id, { key: event.target.value })
                }
              />
              {errorMessage && (
                <p
                  id={`${baseId}-key-error`}
                  className='text-destructive text-xs'
                >
                  {errorMessage}
                </p>
              )}
            </>
          ) : (
            <span
              id={`${baseId}-key`}
              className='truncate font-mono text-sm leading-8'
              title={row.key}
            >
              {row.key}
            </span>
          )}
        </div>

        <div className='flex min-w-0 flex-col gap-1'>
          <Label htmlFor={`${baseId}-label`} className={mobileLabelClassName}>
            {t('Name')}
          </Label>
          <Input
            id={`${baseId}-label`}
            value={row.label}
            placeholder={row.key || t('Name')}
            onChange={(event) =>
              props.onUpdate(row.id, { label: event.target.value })
            }
          />
        </div>

        <div className='flex min-w-0 flex-col gap-1'>
          <Label htmlFor={`${baseId}-ratio`} className={mobileLabelClassName}>
            {t('Ratio')}
          </Label>
          <Input
            id={`${baseId}-ratio`}
            type='number'
            min={0}
            step={0.0001}
            value={row.ratio}
            onChange={(event) =>
              props.onUpdate(row.id, { ratio: event.target.value })
            }
          />
        </div>

        <div className='flex min-w-0 flex-col gap-1'>
          <Label htmlFor={`${baseId}-topup`} className={mobileLabelClassName}>
            {t('Top-up ratio')}
          </Label>
          <Input
            id={`${baseId}-topup`}
            type='number'
            min={0}
            step={0.0001}
            value={row.topupRatio}
            placeholder={t('Not set')}
            onChange={(event) =>
              props.onUpdate(row.id, { topupRatio: event.target.value })
            }
          />
        </div>

        <div className='flex min-w-0 items-center justify-between gap-2 sm:h-8 sm:justify-center'>
          <Label htmlFor={`${baseId}-visible`} className={mobileLabelClassName}>
            {t('Default visible')}
          </Label>
          <Switch
            id={`${baseId}-visible`}
            checked={row.defaultVisible}
            onCheckedChange={(checked) =>
              props.onUpdate(row.id, { defaultVisible: checked })
            }
          />
        </div>
      </div>

      <RowOrderControls
        className='justify-end border-t pt-2 sm:border-t-0 sm:pt-0'
        name={displayName}
        index={props.index}
        count={props.count}
        dragControls={dragControls}
        onMove={props.onMove}
        onRemove={() => props.onDelete(row)}
        removeDisabled={!props.deletable}
        removeTitle={
          props.deletable ? undefined : t('The default group cannot be deleted')
        }
      />
    </Reorder.Item>
  )
}
