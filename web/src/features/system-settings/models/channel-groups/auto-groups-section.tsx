// TokenFunc 二开：渠道分组列表下方的「自动分组」折叠区。
// 候选顺序增删与上下移动沿用上游 GroupRatioVisualEditor 的 auto 段交互；
// 开关与上限输入由上层以 FormField 传入，保留 react-hook-form 校验。
import { ChevronDown } from 'lucide-react'
import { Reorder } from 'motion/react'
import { useCallback, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { AutoGroupOrderItem } from '@/components/auto-group-order-item'
import { EmptyState } from '@/components/empty-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Combobox } from '@/components/ui/combobox'
import { Separator } from '@/components/ui/separator'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { safeJsonParse } from '../../utils/json-parser'

type AutoGroupsSectionProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** AutoGroups 字段的 JSON 字符串 */
  autoGroups: string
  /** 当前页面上的渠道分组 key（已按显示顺序） */
  channelGroupKeys: string[]
  onAutoGroupsChange: (json: string) => void
  defaultUseAutoGroupField: ReactNode
  maxTokenAutoGroupsField: ReactNode
}

export function AutoGroupsSection(props: AutoGroupsSectionProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const autoGroupsList = useMemo(
    () =>
      safeJsonParse<string[]>(props.autoGroups, {
        fallback: [],
        silent: true,
      }),
    [props.autoGroups]
  )

  const emit = props.onAutoGroupsChange
  const handleAdd = useCallback(
    (name: string) => {
      if (autoGroupsList.includes(name)) return
      emit(JSON.stringify([...autoGroupsList, name], null, 2))
    },
    [autoGroupsList, emit]
  )

  const handleRemove = useCallback(
    (group: string) => {
      emit(
        JSON.stringify(
          autoGroupsList.filter((item) => item !== group),
          null,
          2
        )
      )
    },
    [autoGroupsList, emit]
  )

  const handleMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const list = [...autoGroupsList]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= list.length) return
      ;[list[index], list[target]] = [list[target], list[index]]
      emit(JSON.stringify(list, null, 2))
    },
    [autoGroupsList, emit]
  )

  const candidates = useMemo(
    () =>
      props.channelGroupKeys
        .filter((key) => !autoGroupsList.includes(key))
        .map((key) => ({ value: key, label: key })),
    [props.channelGroupKeys, autoGroupsList]
  )

  return (
    <Collapsible
      open={props.open}
      onOpenChange={props.onOpenChange}
      className='rounded-lg border'
    >
      <div className='flex items-center justify-between gap-2 p-3'>
        <CollapsibleTrigger
          render={
            <Button
              type='button'
              variant='ghost'
              className='h-auto min-w-0 justify-start whitespace-normal'
            />
          }
        >
          <ChevronDown
            className='size-4 shrink-0 transition-transform group-data-open/trigger:rotate-180'
            aria-hidden='true'
          />
          <span className='font-semibold'>{t('Auto group order')}</span>
          <span className='text-muted-foreground text-sm'>
            {t('{{count}} groups', { count: autoGroupsList.length })}
          </span>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className='grid gap-6 border-t p-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]'>
          <div className='flex min-w-0 flex-col gap-3'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Priority order for tokens in the auto group. The system tries groups from top to bottom.'
              )}
            </p>
            <Combobox
              options={candidates}
              value={null}
              className='w-full'
              placeholder={t('Add group')}
              aria-label={t('Add group')}
              onValueChange={(value: string | null) => {
                if (value) handleAdd(value)
              }}
            />
            {autoGroupsList.length === 0 ? (
              <EmptyState
                className='min-h-32'
                title={t('No auto groups configured')}
                description={t('Add groups in the order they should be tried.')}
              />
            ) : (
              <Reorder.Group
                as='ol'
                axis='y'
                values={autoGroupsList}
                onReorder={(groups) => emit(JSON.stringify(groups, null, 2))}
                aria-label={t('Auto group order')}
                className='flex flex-col gap-2'
              >
                {autoGroupsList.map((group, index) => (
                  <AutoGroupOrderItem
                    key={group}
                    group={group}
                    index={index}
                    count={autoGroupsList.length}
                    onMove={handleMove}
                    onRemove={handleRemove}
                    leading={
                      <span className='text-muted-foreground w-5 shrink-0 text-center text-sm tabular-nums'>
                        {formatNumber(index + 1, locale)}
                      </span>
                    }
                  >
                    {!props.channelGroupKeys.includes(group) && (
                      <StatusBadge variant='danger' copyable={false}>
                        {t('Not in pricing table')}
                      </StatusBadge>
                    )}
                  </AutoGroupOrderItem>
                ))}
              </Reorder.Group>
            )}
          </div>
          <div className='bg-muted/20 flex min-w-0 flex-col gap-4 self-start rounded-lg border p-4'>
            {props.defaultUseAutoGroupField}
            <Separator />
            {props.maxTokenAutoGroupsField}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
