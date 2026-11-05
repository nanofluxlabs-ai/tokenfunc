// TokenFunc 二开：用户分组列表的一行。桌面渲染为表格行，手机渲染为卡片；两种布局共用拖拽把手与操作按钮。
import { Drag01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { Coins, Pencil, Trash2 } from 'lucide-react'
import { Reorder, useDragControls } from 'motion/react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { TableCell } from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { translateServerText } from '@/lib/server-error-message'
import type { UserGroupItem } from '@/lib/tokenfunc-groups'
import { cn } from '@/lib/utils'

export const DEFAULT_USER_GROUP_KEY = 'default'

type UserGroupRowProps = {
  group: UserGroupItem
  index: number
  count: number
  layout: 'table' | 'card'
  onMove: (index: number, direction: 'up' | 'down') => void
  /** 松开拖拽把手后由父组件决定是否提交新顺序 */
  onDragEnd: () => void
  onEdit: (group: UserGroupItem) => void
  onPricing: (group: UserGroupItem) => void
  onDelete: (group: UserGroupItem) => void
}

/** 用户分组的用户数链到用户列表并按分组筛选；个人 / 企业分组分别落到各自页签 */
function UserCountLink(props: { group: UserGroupItem; className?: string }) {
  const { t } = useTranslation()
  return (
    <Link
      to='/users'
      search={{
        type: props.group.kind === 'enterprise' ? 'enterprise' : 'personal',
        group: [props.group.key],
      }}
      className={cn(
        'hover:text-primary font-mono tabular-nums underline-offset-4 hover:underline',
        props.className
      )}
      aria-label={t('View users of {{group}}', { group: props.group.key })}
    >
      {props.group.user_count}
    </Link>
  )
}

export function UserGroupRow(props: UserGroupRowProps) {
  const { t } = useTranslation()
  const dragControls = useDragControls()
  const group = props.group
  const label = translateServerText(t, group.label) || group.key
  const isDefault = group.key === DEFAULT_USER_GROUP_KEY
  const hasUsers = group.user_count > 0
  const kindLabel =
    group.kind === 'enterprise' ? t('Enterprise') : t('Personal')

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

  const dragHandle = (
    <Button
      type='button'
      variant='ghost'
      size='icon-sm'
      className='text-muted-foreground cursor-grab touch-none active:cursor-grabbing'
      aria-label={t('Drag {{group}} to reorder', { group: group.key })}
      title={t('Drag {{group}} to reorder', { group: group.key })}
      onPointerDown={handleDragStart}
      onKeyDown={handleDragKeyDown}
    >
      <HugeiconsIcon icon={Drag01Icon} strokeWidth={2} aria-hidden='true' />
    </Button>
  )

  const kindBadge = (
    <StatusBadge
      label={kindLabel}
      variant={group.kind === 'enterprise' ? 'info' : 'neutral'}
      copyable={false}
    />
  )

  const overrideCell =
    group.override_count > 0 ? (
      <span className='font-mono tabular-nums'>{group.override_count}</span>
    ) : (
      <span className='text-muted-foreground'>—</span>
    )

  const actions = (
    <div className='flex items-center justify-end gap-1'>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => props.onPricing(group)}
              aria-label={t('Pricing')}
            />
          }
        >
          <Coins />
        </TooltipTrigger>
        <TooltipContent>{t('Pricing')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => props.onEdit(group)}
              aria-label={t('Edit')}
            />
          }
        >
          <Pencil />
        </TooltipTrigger>
        <TooltipContent>{t('Edit')}</TooltipContent>
      </Tooltip>
      {/* default 是上游的保底分组，根本没有删除入口；有用户的分组先迁走用户才能删 */}
      {!isDefault && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='ghost'
                size='icon-sm'
                disabled={hasUsers}
                onClick={() => props.onDelete(group)}
                aria-label={t('Delete')}
                className='text-destructive hover:text-destructive'
              />
            }
          >
            <Trash2 />
          </TooltipTrigger>
          <TooltipContent>
            {hasUsers
              ? t('Move its users to another group before deleting')
              : t('Delete')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )

  const descriptionNode: ReactNode = group.description ? (
    <span className='block truncate' title={group.description}>
      {group.description}
    </span>
  ) : (
    <span className='text-muted-foreground'>—</span>
  )

  if (props.layout === 'card') {
    return (
      <Reorder.Item
        as='li'
        value={group.key}
        dragListener={false}
        dragMomentum={false}
        dragControls={dragControls}
        onDragEnd={props.onDragEnd}
        className='bg-background flex flex-col gap-3 rounded-lg border p-3'
      >
        <div className='flex items-start gap-2'>
          {dragHandle}
          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <span className='truncate text-sm font-medium'>{label}</span>
              {kindBadge}
            </div>
            <code className='text-muted-foreground truncate font-mono text-xs'>
              {group.key}
            </code>
          </div>
        </div>
        <div className='text-muted-foreground text-sm'>{descriptionNode}</div>
        <div className='flex items-center justify-between gap-3 text-sm'>
          <span className='flex items-center gap-4'>
            <span className='flex items-center gap-1.5'>
              <span className='text-muted-foreground'>{t('Users')}</span>
              <UserCountLink group={group} />
            </span>
            <span className='flex items-center gap-1.5'>
              <span className='text-muted-foreground'>
                {t('Pricing differences')}
              </span>
              {overrideCell}
            </span>
          </span>
          {actions}
        </div>
      </Reorder.Item>
    )
  }

  return (
    <Reorder.Item
      as='tr'
      value={group.key}
      dragListener={false}
      dragMomentum={false}
      dragControls={dragControls}
      onDragEnd={props.onDragEnd}
      className='bg-background border-b transition-colors last:border-0 hover:[background-color:color-mix(in_oklch,var(--muted)_50%,var(--background))]'
    >
      <TableCell className='w-10 pr-0'>{dragHandle}</TableCell>
      <TableCell className='max-w-48'>
        <code className='block truncate font-mono text-xs' title={group.key}>
          {group.key}
        </code>
      </TableCell>
      <TableCell className='max-w-56'>
        <span className='block truncate font-medium' title={label}>
          {label}
        </span>
      </TableCell>
      <TableCell>{kindBadge}</TableCell>
      <TableCell className='text-muted-foreground max-w-72'>
        {descriptionNode}
      </TableCell>
      <TableCell className='text-right'>
        <UserCountLink group={group} />
      </TableCell>
      <TableCell className='text-right'>{overrideCell}</TableCell>
      <TableCell>{actions}</TableCell>
    </Reorder.Item>
  )
}
