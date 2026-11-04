import { Edit, HandCoins, LockKeyhole, Users, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DataTableRowActionMenu } from '@/components/data-table/core/row-action-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { EnterpriseListItem } from '../types'
import { useEnterprises } from './enterprises-provider'

/** 企业行操作：与普通用户一致，只露出编辑、充值两个图标，其余收进「更多」菜单 */
export function EnterpriseRowActions(props: {
  enterprise: EnterpriseListItem
}) {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = useEnterprises()
  // 授信企业不走钱包，欠款通过账单收款结清；只有预付企业能充值
  const isCredit = props.enterprise.billing_mode === 'credit'
  const openDialog = (
    dialog: 'update' | 'billing' | 'members' | 'topup' | 'reset-password'
  ) => {
    setCurrentRow(props.enterprise)
    setOpen(dialog)
  }
  return (
    <div className='-ml-1.5 flex items-center gap-1'>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => openDialog('update')}
              aria-label={t('Edit')}
            />
          }
        >
          <Edit />
        </TooltipTrigger>
        <TooltipContent>{t('Edit')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              disabled={isCredit}
              onClick={() => openDialog('topup')}
              aria-label={t('Top-up')}
            />
          }
        >
          <HandCoins />
        </TooltipTrigger>
        <TooltipContent>
          {isCredit
            ? t('Credit enterprises are settled by bill payment')
            : t('Top-up')}
        </TooltipContent>
      </Tooltip>

      <DataTableRowActionMenu
        ariaLabel={t('Open menu')}
        size='icon-sm'
        contentClassName='w-44'
      >
        <DropdownMenuItem onClick={() => openDialog('billing')}>
          {t('Billing')}
          <DropdownMenuShortcut>
            <Wallet size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openDialog('members')}>
          {t('Members')}
          <DropdownMenuShortcut>
            <Users size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* 重置企业主账号的登录密码：与个人用户同一个弹窗与接口 */}
        <DropdownMenuItem onClick={() => openDialog('reset-password')}>
          {t('Reset password')}
          <DropdownMenuShortcut>
            <LockKeyhole size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DataTableRowActionMenu>
    </div>
  )
}
