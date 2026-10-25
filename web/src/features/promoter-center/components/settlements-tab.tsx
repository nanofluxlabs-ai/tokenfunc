import { useTranslation } from 'react-i18next'

import { usePromoterSettlements } from '../hooks/use-promoter-center-queries'
import type { PromoterRangeParams, PromoterScope } from '../types'
import { SettlementsTable } from './settlements-table'

type SettlementsTabProps = {
  scope: PromoterScope
  range: PromoterRangeParams
  enabled: boolean
}

/** 推广中心「结算」tab：区间只决定列出哪些自然月，每月一行为整月口径 */
export function SettlementsTab(props: SettlementsTabProps) {
  const { t } = useTranslation()
  const params = props.range ?? { all: true as const }
  const settlements = usePromoterSettlements(props.scope, params, props.enabled)
  return (
    <div className='flex flex-col gap-3'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Settlements are counted per full calendar month in the billing time zone; the date range only selects which months are listed.'
        )}
      </p>
      <SettlementsTable
        items={settlements.data ?? []}
        loading={settlements.isLoading}
        fetching={settlements.isFetching}
        showOperator={props.scope.scope === 'admin'}
        emptyTitle={t('No months in the selected range')}
      />
    </div>
  )
}
