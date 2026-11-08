// TokenFunc 二开：系统设置 › 分组定价 里的「用户分组定价」面板。
// 左列列出用户分组（手机端换成顶部下拉），右侧是选中分组的渠道分组定价表；
// 左列可直接新建用户分组（复用用户管理页的抽屉，实时保存）；删除 / 排序用户分组仍在用户管理 › 用户分组 页签里做。
// 定价草稿由 useUserGroupPricingPanel 持有，交给页面右上角的「保存」与段一一起提交。
import { Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMediaQuery } from '@/hooks'
import { translateServerText } from '@/lib/server-error-message'
import type { UserGroupItem } from '@/lib/tokenfunc-groups'
import { cn } from '@/lib/utils'

import type { UserGroupPricingPanelState } from '../hooks/use-user-group-pricing-panel'
import { UserGroupMutateDrawer } from './user-group-mutate-drawer'
import { AddChannelGroupButton } from './user-group-pricing-add-dialog'
import { UserGroupPricingTable } from './user-group-pricing-table'
import { UserGroupKindBadge } from './user-group-row'

type UserGroupPricingPanelProps = {
  state: UserGroupPricingPanelState
  /** 页面正在统一保存时锁住表格与配置按钮 */
  disabled?: boolean
  className?: string
}

export function UserGroupPricingPanel(props: UserGroupPricingPanelProps) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const state = props.state
  const groups = state.groups
  const selected = state.selected
  const groupKey = state.groupKey
  const pricing = state.pricing
  const choose = state.choose
  const locked = props.disabled || pricing.isSaving
  const [createOpen, setCreateOpen] = useState(false)

  const labelOf = (group: UserGroupItem) =>
    translateServerText(t, group.label) || group.key

  const createDrawer = (
    <UserGroupMutateDrawer
      open={createOpen}
      onOpenChange={setCreateOpen}
      onCreated={choose}
    />
  )
  const addUserGroupButton = (
    <Button
      type='button'
      size='sm'
      variant='outline'
      className='shrink-0'
      onClick={() => setCreateOpen(true)}
    >
      <Plus className='size-4' aria-hidden='true' />
      {t('Create user group')}
    </Button>
  )

  if (state.isLoading) {
    return <LoadingState className={props.className} />
  }
  if (groups.length === 0 || !selected) {
    return (
      <>
        <EmptyState
          className={props.className}
          icon={Users}
          title={t('No user groups yet')}
          description={t(
            'Create a user group to offer different channel groups and prices.'
          )}
          action={addUserGroupButton}
        />
        {createDrawer}
      </>
    )
  }

  const selectItems = groups.map((group) => ({
    value: group.key,
    label: labelOf(group),
  }))

  const groupPicker = isMobile ? (
    <div className='flex items-center gap-2'>
      <Select
        items={selectItems}
        value={groupKey}
        onValueChange={(value) => value !== null && choose(value)}
      >
        <SelectTrigger className='min-w-0 flex-1' aria-label={t('User group')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {selectItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {addUserGroupButton}
    </div>
  ) : (
    <div className='flex min-w-0 flex-col gap-2'>
      <div className='flex items-center justify-between gap-2 px-3'>
        <h3 className='text-base font-semibold'>{t('User groups')}</h3>
        {addUserGroupButton}
      </div>
      <ul className='flex flex-col gap-1' aria-label={t('User groups')}>
        {groups.map((group) => {
          const isSelected = group.key === groupKey
          return (
            <li key={group.key}>
              <button
                type='button'
                aria-current={isSelected || undefined}
                onClick={() => choose(group.key)}
                className={cn(
                  'hover:bg-muted/60 flex w-full items-start gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm transition-colors',
                  isSelected && 'bg-muted border-border'
                )}
              >
                <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                  <span className='flex min-w-0 flex-wrap items-center gap-2'>
                    <span className='truncate font-medium'>
                      {labelOf(group)}
                    </span>
                    <UserGroupKindBadge kind={group.kind} />
                  </span>
                  <code className='text-muted-foreground truncate font-mono text-xs'>
                    {group.key}
                  </code>
                </span>
                {group.override_count > 0 && (
                  <StatusBadge
                    label={String(group.override_count)}
                    variant='info'
                    copyable={false}
                    title={t('Pricing differences')}
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <div
      className={cn(
        'flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start md:gap-6',
        props.className
      )}
    >
      {groupPicker}
      <section
        className='flex min-w-0 flex-col gap-4'
        aria-labelledby='user-group-pricing-title'
      >
        <div className='flex flex-col gap-1'>
          <div className='flex items-start justify-between gap-2'>
            <h3
              id='user-group-pricing-title'
              className='flex min-w-0 flex-wrap items-center gap-2 text-base font-semibold'
            >
              <span>
                {t('Channel group pricing of {{name}}', {
                  name: labelOf(selected),
                })}
              </span>
              <span className='text-muted-foreground font-mono text-sm font-normal'>
                {selected.key}
              </span>
            </h3>
            <AddChannelGroupButton
              className='shrink-0'
              rows={pricing.rows}
              onChange={pricing.setRows}
              disabled={pricing.isLoading || locked}
            />
          </div>
          <p className='text-muted-foreground text-sm'>
            {t(
              'The order here is what users of this group see in the token group list; tokens of an enterprise tier that leave the group empty try these groups in this order for the requested model; an empty ratio inherits the base ratio of the channel group.'
            )}
          </p>
        </div>
        {pricing.isLoading ? (
          <LoadingState size='sm' />
        ) : (
          // 换分组时重挂载，避免上一组的拖拽状态串过来
          <UserGroupPricingTable
            key={groupKey}
            rows={pricing.rows}
            onChange={pricing.setRows}
            disabled={locked}
          />
        )}
      </section>
      <ConfirmDialog
        open={state.pendingKey !== null}
        onOpenChange={(open) => !open && state.cancelSwitch()}
        title={t('Discard unsaved changes?')}
        desc={t('Your changes have not been saved.')}
        confirmText={t('Discard changes')}
        handleConfirm={state.discardAndSwitch}
      />
      {createDrawer}
    </div>
  )
}
