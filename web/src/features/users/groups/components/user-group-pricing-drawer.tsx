// TokenFunc 二开：用户管理 › 用户分组 里某个分组的渠道分组定价抽屉。
// 表格与保存逻辑在 UserGroupPricingTable / useUserGroupPricing，这里只管抽屉壳子。
import { useTranslation } from 'react-i18next'

import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { translateServerText } from '@/lib/server-error-message'
import type { UserGroupItem } from '@/lib/tokenfunc-groups'

import { useUserGroupPricing } from '../hooks/use-user-group-pricing'
import { AddChannelGroupButton } from './user-group-pricing-add-dialog'
import { UserGroupPricingTable } from './user-group-pricing-table'

type UserGroupPricingDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: UserGroupItem
  /** 没有 group_pricing.price 时只读：可查看，不能配置渠道分组、调整、保存 */
  readOnly?: boolean
}

export function UserGroupPricingDrawer(props: UserGroupPricingDrawerProps) {
  const { t } = useTranslation()
  const group = props.group
  const groupKey = group?.key ?? ''
  const pricing = useUserGroupPricing(groupKey, { enabled: props.open })

  const handleOpenChange = (open: boolean) => {
    // 关闭即放弃：下次打开从服务端快照重新开始
    if (!open) pricing.reset()
    props.onOpenChange(open)
  }

  const onSave = async () => {
    if (await pricing.save()) props.onOpenChange(false)
  }

  const groupLabel = group
    ? translateServerText(t, group.label) || group.key
    : ''

  return (
    <Sheet open={props.open} onOpenChange={handleOpenChange}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[760px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle className='flex min-w-0 flex-wrap items-center gap-2'>
            <span>
              {t('Channel group pricing of {{name}}', { name: groupLabel })}
            </span>
            {group && (
              <span className='text-muted-foreground font-mono text-sm font-normal'>
                {group.key}
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            {t(
              'The order here is what users of this group see in the token group list; tokens of an enterprise tier that leave the group empty try these groups in this order for the requested model; an empty ratio inherits the base ratio of the channel group.'
            )}
          </SheetDescription>
        </SheetHeader>
        <div className={sideDrawerFormClassName('gap-4')}>
          {props.readOnly ? (
            <p className='text-muted-foreground text-sm'>
              {t(
                'You can view this pricing only. Ask a root administrator for the permission to edit group pricing.'
              )}
            </p>
          ) : (
            <div className='flex justify-end'>
              <AddChannelGroupButton
                rows={pricing.rows}
                onChange={pricing.setRows}
                disabled={pricing.isLoading || pricing.isSaving}
              />
            </div>
          )}
          {pricing.isLoading ? (
            <LoadingState size='sm' />
          ) : (
            // 换分组时重挂载，避免上一组的拖拽状态串过来
            <UserGroupPricingTable
              key={groupKey}
              rows={pricing.rows}
              onChange={pricing.setRows}
              disabled={props.readOnly || pricing.isSaving}
            />
          )}
        </div>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {props.readOnly ? t('Close') : t('Cancel')}
          </SheetClose>
          {!props.readOnly && (
            <Button
              type='button'
              onClick={() => void onSave()}
              disabled={pricing.isSaving || pricing.isLoading || !group}
            >
              {pricing.isSaving ? t('Saving...') : t('Save changes')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
