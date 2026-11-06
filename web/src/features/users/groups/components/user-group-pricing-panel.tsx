// TokenFunc 二开：系统设置 › 分组定价 里的「用户分组定价」面板。
// 左列列出用户分组（手机端换成顶部下拉），右侧是选中分组的渠道分组定价表；
// 左列可直接新建用户分组（复用用户管理页的抽屉）；删除 / 排序用户分组仍在用户管理 › 用户分组 页签里做。
import { useQuery } from '@tanstack/react-query'
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
import {
  requireServerSuccess,
  translateServerText,
} from '@/lib/server-error-message'
import {
  listUserGroups,
  tokenFuncGroupQueryKeys,
  type UserGroupItem,
} from '@/lib/tokenfunc-groups'
import { cn } from '@/lib/utils'

import { useUserGroupPricing } from '../hooks/use-user-group-pricing'
import { UserGroupMutateDrawer } from './user-group-mutate-drawer'
import { AddChannelGroupButton } from './user-group-pricing-add-dialog'
import { UserGroupPricingTable } from './user-group-pricing-table'
import { UserGroupKindBadge } from './user-group-row'

type UserGroupPricingPanelProps = {
  className?: string
}

export function UserGroupPricingPanel(props: UserGroupPricingPanelProps) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const query = useQuery({
    queryKey: tokenFuncGroupQueryKeys.user,
    queryFn: async () => requireServerSuccess(await listUserGroups()),
  })
  const groups = query.data?.data ?? []

  // 没选过或选中的分组已被删除时回落到第一项
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected =
    groups.find((group) => group.key === selectedKey) ?? groups[0]
  const groupKey = selected?.key ?? ''
  const pricing = useUserGroupPricing(groupKey)
  // 有未保存改动时切换分组先确认，这里记住想切去的分组
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // 新建分组成功后也走同一条切换路径：当前有未保存改动时同样先确认
  const choose = (key: string) => {
    if (key === groupKey) return
    if (pricing.isDirty) {
      setPendingKey(key)
      return
    }
    setSelectedKey(key)
  }

  const discardAndSwitch = () => {
    if (pendingKey !== null) {
      pricing.reset()
      setSelectedKey(pendingKey)
    }
    setPendingKey(null)
  }

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
      {t('Add user group')}
    </Button>
  )

  if (query.isLoading) {
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
              disabled={pricing.isLoading || pricing.isSaving}
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
            disabled={pricing.isSaving}
          />
        )}
        <div className='flex justify-end'>
          <Button
            type='button'
            onClick={() => void pricing.save()}
            disabled={!pricing.isDirty || pricing.isSaving || pricing.isLoading}
          >
            {pricing.isSaving ? t('Saving...') : t('Save')}
          </Button>
        </div>
      </section>
      <ConfirmDialog
        open={pendingKey !== null}
        onOpenChange={(open) => !open && setPendingKey(null)}
        title={t('Discard unsaved changes?')}
        desc={t('Your changes have not been saved.')}
        confirmText={t('Discard changes')}
        handleConfirm={discardAndSwitch}
      />
      {createDrawer}
    </div>
  )
}
