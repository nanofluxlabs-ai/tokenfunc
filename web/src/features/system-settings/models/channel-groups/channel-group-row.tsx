// TokenFunc 二开：渠道分组列表里的一行。
// 桌面端为一行网格：把手 · key · 名称 · 基准倍率 · 充值倍率 · 默认可见 · 删除；
// 手机端（<sm）字段纵排成卡片，每个字段显示自己的标签。
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  Drag01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Reorder, useDragControls } from 'motion/react'
import { useId, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import type { ChannelGroupKeyError, ChannelGroupRow } from './lib/serialization'

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

  const handleDragStart = (event: PointerEvent<HTMLButtonElement>) => {
    dragControls.start(event)
  }

  const handleDragKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      props.onMove(props.index, 'up')
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      props.onMove(props.index, 'down')
    }
  }

  return (
    <Reorder.Item
      value={row.id}
      dragListener={false}
      dragMomentum={false}
      dragControls={dragControls}
      data-slot='channel-group-row'
      className='bg-background relative flex min-w-0 items-start gap-2 rounded-lg border p-2 sm:items-center'
    >
      <div className='flex shrink-0 flex-col gap-1 sm:flex-row'>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          className='text-muted-foreground cursor-grab touch-none active:cursor-grabbing'
          aria-label={t('Drag {{group}} to reorder', { group: displayName })}
          title={t('Drag {{group}} to reorder', { group: displayName })}
          onPointerDown={handleDragStart}
          onKeyDown={handleDragKeyDown}
        >
          <HugeiconsIcon icon={Drag01Icon} strokeWidth={2} aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          disabled={props.index === 0}
          aria-label={t('Move {{group}} up', { group: displayName })}
          onClick={() => props.onMove(props.index, 'up')}
        >
          <HugeiconsIcon
            icon={ArrowUp01Icon}
            strokeWidth={2}
            aria-hidden='true'
          />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          disabled={props.index === props.count - 1}
          aria-label={t('Move {{group}} down', { group: displayName })}
          onClick={() => props.onMove(props.index, 'down')}
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            aria-hidden='true'
          />
        </Button>
      </div>

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

      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='text-muted-foreground hover:text-destructive shrink-0'
        disabled={!props.deletable}
        aria-label={t('Remove {{group}}', { group: displayName })}
        title={
          props.deletable
            ? t('Remove {{group}}', { group: displayName })
            : t('The default group cannot be deleted')
        }
        onClick={() => props.onDelete(row)}
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} aria-hidden='true' />
      </Button>
    </Reorder.Item>
  )
}
