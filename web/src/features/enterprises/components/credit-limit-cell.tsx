import { useTranslation } from 'react-i18next'

import { Progress } from '@/components/ui/progress'
import { formatQuotaWithCurrency } from '@/lib/currency'

import type { EnterpriseListItem } from '../types'

// 授信企业列表的「授信额度」单元格：当前账期 剩余 / 总额度 + 剩余比例进度条
export function CreditLimitCell(props: { item: EnterpriseListItem }) {
  const { t } = useTranslation()
  const limit = props.item.period_limit_quota
  const remaining = Math.max(limit - props.item.period_used_quota, 0)
  const percent = limit > 0 ? Math.min(100, (remaining / limit) * 100) : 0
  const label = `${formatQuotaWithCurrency(remaining)} / ${formatQuotaWithCurrency(limit)}`
  return (
    <div className='flex min-w-[180px] flex-col gap-1'>
      <span className='font-mono text-sm'>{label}</span>
      <Progress
        value={percent}
        aria-label={`${t('Credit Limit')} ${label}`}
        trackClassName='h-1'
        indicatorClassName='bg-success'
      />
    </div>
  )
}
