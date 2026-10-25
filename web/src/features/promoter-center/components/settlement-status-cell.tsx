import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { formatTimestampToDate } from '@/lib/format'

import type { PromoterSettlementMonth } from '../types'

/** 月份行状态：已结算（带日期）/ 进行中（当前月）/ 待结算 */
export function SettlementStatusCell(props: {
  month: PromoterSettlementMonth
}) {
  const { t } = useTranslation()
  const month = props.month
  if (month.settled && month.settlement) {
    return (
      <div className='flex flex-col gap-0.5'>
        <StatusBadge
          label={t('Payout settled')}
          variant='success'
          size='sm'
          copyable={false}
        />
        <span className='text-muted-foreground text-xs'>
          {formatTimestampToDate(month.settlement.settled_at)}
        </span>
      </div>
    )
  }
  if (!month.settleable) {
    return (
      <StatusBadge
        label={t('In progress')}
        variant='neutral'
        size='sm'
        copyable={false}
      />
    )
  }
  return (
    <StatusBadge
      label={t('Pending settlement')}
      variant='warning'
      size='sm'
      copyable={false}
    />
  )
}
