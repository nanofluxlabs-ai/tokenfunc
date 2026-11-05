// TokenFunc 二开：渠道分组列表下方的「自动分组」折叠区。
// 候选顺序增删与上下移动沿用上游 GroupRatioVisualEditor 的 auto 段交互；
// 行控件与渠道分组行共用 RowOrderControls（操作组统一放行尾）；
// 开关与上限输入由上层以 FormField 传入，保留 react-hook-form 校验。
import { ChevronDown } from 'lucide-react'
import { Reorder, useDragControls } from 'motion/react'
import { useCallback, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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
import { RowOrderControls } from './row-order-controls'

/** 自动分组候选所需的渠道分组摘要（已按显示顺序） */
export type AutoGroupCandidate = {
  key: string
  ratio: string
}

type AutoGroupsSectionProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** AutoGroups 字段的 JSON 字符串 */
  autoGroups: string
  /** 当前页面上 key 合法的渠道分组 */
  channelGroups: AutoGroupCandidate[]
  onAutoGroupsChange: (json: string) => void
  defaultUseAutoGroupField: ReactNode
  maxTokenAutoGroupsField: ReactNode
}

type AutoGroupRowProps = {
  group: string
  index: number
  count: number
  /** 对应渠道分组的基准倍率；分组已不在定价表时为 null */
  ratio: string | null
  onMove: (index: number, direction: 'up' | 'down') => void
  onRemove: (group: string) => void
}

function AutoGroupRow(props: AutoGroupRowProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const dragControls = useDragControls()
  const ratioNumber = props.ratio === null ? Number.NaN : Number(props.ratio)

  return (
    <Reorder.Item
      value={props.group}
      dragListener={false}
      dragMomentum={false}
      dragControls={dragControls}
      data-slot='auto-group-row'
      className='bg-background relative flex min-w-0 items-center gap-2 rounded-lg border p-2'
    >
      <span className='text-muted-foreground w-5 shrink-0 text-center text-sm tabular-nums'>
        {formatNumber(props.index + 1, locale)}
      </span>
      <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
        <span
          className='min-w-0 truncate font-mono text-sm font-medium'
          title={props.group}
        >
          {props.group}
        </span>
        {props.ratio === null ? (
          <StatusBadge variant='danger' copyable={false}>
            {t('Not in pricing table')}
          </StatusBadge>
        ) : (
          <StatusBadge variant='neutral' copyable={false}>
            {t('Ratio')}{' '}
            {Number.isNaN(ratioNumber)
              ? props.ratio
              : formatNumber(ratioNumber, locale)}
          </StatusBadge>
        )}
      </div>
      <RowOrderControls
        name={props.group}
        index={props.index}
        count={props.count}
        dragControls={dragControls}
        onMove={props.onMove}
        onRemove={() => props.onRemove(props.group)}
        removeIcon='cancel'
      />
    </Reorder.Item>
  )
}

export function AutoGroupsSection(props: AutoGroupsSectionProps) {
  const { t } = useTranslation()

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

  const ratioByKey = useMemo(
    () => new Map(props.channelGroups.map((group) => [group.key, group.ratio])),
    [props.channelGroups]
  )

  const candidates = useMemo(
    () =>
      props.channelGroups
        .filter((group) => !autoGroupsList.includes(group.key))
        .map((group) => ({ value: group.key, label: group.key })),
    [props.channelGroups, autoGroupsList]
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
                  <AutoGroupRow
                    key={group}
                    group={group}
                    index={index}
                    count={autoGroupsList.length}
                    ratio={ratioByKey.get(group) ?? null}
                    onMove={handleMove}
                    onRemove={handleRemove}
                  />
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
