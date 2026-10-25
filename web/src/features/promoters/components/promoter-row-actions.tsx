import { Link } from '@tanstack/react-router'
import { BarChart3, Pencil, Trash2, Users2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { PromoterListItem } from '../types'
import { usePromoters } from './promoters-provider'

export function PromoterRowActions(props: { promoter: PromoterListItem }) {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = usePromoters()
  return (
    <div className='-ml-1.5 flex items-center gap-1'>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => {
                setCurrentRow(props.promoter)
                setOpen('edit')
              }}
              aria-label={t('Edit promoter')}
            />
          }
        >
          <Pencil />
        </TooltipTrigger>
        <TooltipContent>{t('Edit promoter')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => {
                setCurrentRow(props.promoter)
                setOpen('bindings')
              }}
              aria-label={t('Manage bindings')}
            />
          }
        >
          <Users2 />
        </TooltipTrigger>
        <TooltipContent>{t('Manage bindings')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              to='/promoters/$id/center'
              params={{ id: String(props.promoter.id) }}
              aria-label={t('Promoter Center')}
              className='inline-flex'
            >
              <Button variant='ghost' size='icon-sm' tabIndex={-1}>
                <BarChart3 />
              </Button>
            </Link>
          }
        />
        <TooltipContent>{t('Promoter Center')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              className='text-destructive hover:text-destructive'
              onClick={() => {
                setCurrentRow(props.promoter)
                setOpen('remove')
              }}
              aria-label={t('Remove promoter')}
            />
          }
        >
          <Trash2 />
        </TooltipTrigger>
        <TooltipContent>{t('Remove promoter')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
