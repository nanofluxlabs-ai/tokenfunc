// TokenFunc 二开：分组行尾部的操作组（上移 / 下移 / 拖动把手 / 移除）。
// 渠道分组行与自动分组行共用，保证两处控件样式与顺序一致；
// 拖动由上层 Reorder.Item 的 dragControls 驱动，把手只负责触发与键盘上下移。
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Delete02Icon,
  Drag01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { DragControls } from 'motion/react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** 操作组宽度：4 个 icon-sm 按钮（size-7）+ 3 个 gap-1，表头占位用 */
export const rowOrderControlsWidthClassName = 'w-[7.75rem]'

type RowOrderControlsProps = {
  /** 用于可访问名称的行名 */
  name: string
  index: number
  count: number
  dragControls: DragControls
  onMove: (index: number, direction: 'up' | 'down') => void
  onRemove: () => void
  removeDisabled?: boolean
  /** 禁用移除时的提示；未传则与可访问名称相同 */
  removeTitle?: string
  /** 移除图标：渠道分组用垃圾桶（真正删除），自动分组用叉号（仅移出列表） */
  removeIcon?: 'delete' | 'cancel'
  className?: string
}

export function RowOrderControls(props: RowOrderControlsProps) {
  const { t } = useTranslation()
  const name = props.name
  const removeLabel = t('Remove {{group}}', { group: name })

  const handleDragStart = (event: PointerEvent<HTMLButtonElement>) => {
    props.dragControls.start(event)
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
    <div
      data-slot='row-actions'
      className={cn('flex shrink-0 items-center gap-1', props.className)}
    >
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        disabled={props.index === 0}
        aria-label={t('Move {{group}} up', { group: name })}
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
        aria-label={t('Move {{group}} down', { group: name })}
        onClick={() => props.onMove(props.index, 'down')}
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          aria-hidden='true'
        />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='text-muted-foreground cursor-grab touch-none active:cursor-grabbing'
        aria-label={t('Drag {{group}} to reorder', { group: name })}
        title={t('Drag {{group}} to reorder', { group: name })}
        onPointerDown={handleDragStart}
        onKeyDown={handleDragKeyDown}
      >
        <HugeiconsIcon icon={Drag01Icon} strokeWidth={2} aria-hidden='true' />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='text-muted-foreground hover:text-destructive'
        disabled={props.removeDisabled}
        aria-label={removeLabel}
        title={props.removeTitle ?? removeLabel}
        onClick={props.onRemove}
      >
        <HugeiconsIcon
          icon={props.removeIcon === 'cancel' ? Cancel01Icon : Delete02Icon}
          strokeWidth={2}
          aria-hidden='true'
        />
      </Button>
    </div>
  )
}
