import { Edit, Users, Wallet } from 'lucide-react'
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
    </div>
  )
}
