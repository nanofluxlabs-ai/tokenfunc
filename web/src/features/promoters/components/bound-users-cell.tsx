import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { PromoterListItem } from '../types'
import { usePromoters } from './promoters-provider'

/** 列表里的绑定数：点击直接打开绑定管理 */
export function BoundUsersCell(props: { promoter: PromoterListItem }) {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = usePromoters()
  return (
    <Button
      variant='ghost'
      size='sm'
      className='-ml-2 h-7 px-2 font-mono tabular-nums'
      aria-label={t('Manage bindings')}
      onClick={() => {
        setCurrentRow(props.promoter)
        setOpen('bindings')
      }}
    >
      {props.promoter.bound_user_count}
    </Button>
  )
}
