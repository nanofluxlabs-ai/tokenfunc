import { Edit, HandCoins, Users, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { EnterpriseListItem } from '../types'
import { useEnterprises } from './enterprises-provider'

export function EnterpriseRowActions(props: {
  enterprise: EnterpriseListItem
}) {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = useEnterprises()
  // 授信企业不走钱包，欠款通过账单收款结清；只有预付企业能充值
  const isCredit = props.enterprise.billing_mode === 'credit'
  return (
    <div className='-ml-1.5 flex items-center gap-1'>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => {
                setCurrentRow(props.enterprise)
                setOpen('update')
              }}
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
              onClick={() => {
                setCurrentRow(props.enterprise)
                setOpen('billing')
              }}
              aria-label={t('Billing')}
            />
          }
        >
          <Wallet />
        </TooltipTrigger>
        <TooltipContent>{t('Billing')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => {
                setCurrentRow(props.enterprise)
                setOpen('members')
              }}
              aria-label={t('Members')}
            />
          }
        >
          <Users />
        </TooltipTrigger>
        <TooltipContent>{t('Members')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              disabled={isCredit}
              onClick={() => {
                setCurrentRow(props.enterprise)
                setOpen('topup')
              }}
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
    </div>
  )
}
