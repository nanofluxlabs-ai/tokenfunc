// TokenFunc 二开：渠道列表的分组列——显示渠道分组名称（悬浮 key），单个渠道可在弹层里直接改分组。
// Tag 聚合行只展示，不提供行内编辑。
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GroupBadge } from '@/components/group-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useChannelGroupOptions } from '@/hooks/use-group-options'

import { handleUpdateChannelGroups } from '../lib/channel-actions'
import {
  isTagAggregateRow,
  parseGroupsList,
  type TagRow,
} from '../lib/channel-utils'
import type { Channel } from '../types'

type ChannelGroupCellProps = {
  channel: Channel | TagRow
  /** 脱敏模式下分组名用占位符显示 */
  maskedLabel?: string
}

export function ChannelGroupCell(props: ChannelGroupCellProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { options } = useChannelGroupOptions()
  const labelByKey = new Map(
    options.map((option) => [option.key, option.label])
  )
  const groups = parseGroupsList(props.channel.group as string)
  const editable = !isTagAggregateRow(props.channel)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(groups)
  const [saving, setSaving] = useState(false)

  // 弹层每次打开都从当前行重新取值，避免上次未保存的草稿残留
  useEffect(() => {
    if (open) setDraft(parseGroupsList(props.channel.group as string))
  }, [open, props.channel.group])

  // 分组竖排、一行一个、全部展示：渠道常带 3 个以上分组，横排折叠成 +N 看不全
  const badges =
    groups.length === 0 ? (
      <span className='text-muted-foreground text-xs'>-</span>
    ) : (
      <div className='flex min-w-0 flex-col items-start gap-1'>
        {groups.map((group) => (
          <GroupBadge
            key={group}
            group={group}
            label={props.maskedLabel ?? labelByKey.get(group)}
            title={props.maskedLabel ? undefined : group}
            size='sm'
          />
        ))}
      </div>
    )

  if (!editable) {
    return badges
  }

  // 弹层里列出全部渠道分组（按后台排序），渠道当前带着但已不在定价表里的分组也保留可勾选
  const choices = [
    ...options.map((option) => ({ key: option.key, label: option.label })),
    ...groups
      .filter((group) => !labelByKey.has(group))
      .map((group) => ({ key: group, label: group })),
  ]

  const toggle = (key: string, checked: boolean) => {
    setDraft((prev) => {
      if (checked) return prev.includes(key) ? prev : [...prev, key]
      return prev.filter((item) => item !== key)
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const ok = await handleUpdateChannelGroups(
        props.channel.id,
        draft,
        queryClient
      )
      if (ok) setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type='button'
            className='hover:bg-muted/60 focus-visible:ring-ring flex min-w-0 cursor-pointer rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none'
            aria-label={t('Edit groups')}
          />
        }
      >
        {badges}
      </PopoverTrigger>
      <PopoverContent align='start' className='w-64 p-3'>
        <p className='mb-2 text-sm font-medium'>{t('Edit groups')}</p>
        <div className='max-h-60 space-y-2 overflow-y-auto'>
          {choices.map((choice) => {
            const id = `channel-${props.channel.id}-group-${choice.key}`
            return (
              <div key={choice.key} className='flex items-center gap-2'>
                <Checkbox
                  id={id}
                  checked={draft.includes(choice.key)}
                  onCheckedChange={(checked) => toggle(choice.key, !!checked)}
                />
                <Label
                  htmlFor={id}
                  className='min-w-0 flex-1 cursor-pointer truncate font-normal'
                  title={choice.key}
                >
                  {choice.label}
                  {choice.label !== choice.key && (
                    <span className='text-muted-foreground ml-1 text-xs'>
                      {choice.key}
                    </span>
                  )}
                </Label>
              </div>
            )
          })}
        </div>
        {draft.length === 0 && (
          <p className='text-destructive mt-2 text-xs'>
            {t('Keep at least one group')}
          </p>
        )}
        <div className='mt-3 flex justify-end gap-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => setOpen(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            size='sm'
            disabled={saving || draft.length === 0}
            onClick={() => void save()}
          >
            {t('Save')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
