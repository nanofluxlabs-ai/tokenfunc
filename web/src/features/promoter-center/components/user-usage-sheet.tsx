import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { LoadingState } from '@/components/loading-state'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { MetricCard } from '@/features/finance/components/metric-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatQuota } from '@/lib/format'

import { usePromoterUserUsage } from '../hooks/use-promoter-center-queries'
import { describeUsageScope } from '../lib/format'
import type {
  PromoterCenterDaily,
  PromoterCenterModel,
  PromoterCenterUser,
  PromoterRangeParams,
  PromoterScope,
} from '../types'

const NUMERIC = 'text-right tabular-nums'

type UserUsageSheetProps = {
  scope: PromoterScope
  range: PromoterRangeParams
  user: PromoterCenterUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 名下单个用户的下钻：区间汇总 + 每日 + 模型 */
export function UserUsageSheet(props: UserUsageSheetProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const userId = props.user?.user_id ?? 0
  const usage = usePromoterUserUsage(
    props.scope,
    userId,
    props.range,
    props.open
  )
  const data = usage.data

  const dailyColumns = [
    {
      id: 'day',
      header: t('Date'),
      cell: (row: PromoterCenterDaily) => row.day,
    },
    {
      id: 'net_quota',
      header: t('Consumption'),
      className: NUMERIC,
      cellClassName: `${NUMERIC} font-mono`,
      cell: (row: PromoterCenterDaily) => formatQuota(row.net_quota),
    },
    {
      id: 'request_count',
      header: t('Requests'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row: PromoterCenterDaily) =>
        formatCompactNumber(row.request_count, locale),
    },
  ]
  const modelColumns = [
    {
      id: 'model_name',
      header: t('Model'),
      cell: (row: PromoterCenterModel) => row.model_name,
    },
    {
      id: 'net_quota',
      header: t('Consumption'),
      className: NUMERIC,
      cellClassName: `${NUMERIC} font-mono`,
      cell: (row: PromoterCenterModel) => formatQuota(row.net_quota),
    },
    {
      id: 'request_count',
      header: t('Requests'),
      className: NUMERIC,
      cellClassName: NUMERIC,
      cell: (row: PromoterCenterModel) =>
        formatCompactNumber(row.request_count, locale),
    },
  ]

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[640px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle className='flex items-center gap-2'>
            <span className='truncate'>
              {props.user?.username || `#${userId}`}
            </span>
            <span className='text-muted-foreground font-mono text-sm font-normal'>
              #{userId}
            </span>
          </SheetTitle>
          <SheetDescription>
            {props.user ? describeUsageScope(props.user, t) : ''}
            {props.range ? ` · ${props.range.start} ~ ${props.range.end}` : ''}
          </SheetDescription>
        </SheetHeader>
        <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 sm:px-6'>
          {usage.isLoading ? (
            <LoadingState />
          ) : (
            <>
              <div className='grid grid-cols-3 gap-3'>
                <MetricCard
                  label={t('Consumption')}
                  value={formatQuota(data?.summary.net_quota ?? 0)}
                />
                <MetricCard
                  label={t('Requests')}
                  value={formatCompactNumber(
                    data?.summary.request_count ?? 0,
                    locale
                  )}
                />
                <MetricCard
                  label={t('Tokens')}
                  value={formatCompactNumber(
                    data?.summary.total_tokens ?? 0,
                    locale
                  )}
                />
              </div>
              <SideDrawerSection>
                <SideDrawerSectionHeader title={t('Summary by day')} />
                <StaticDataTable
                  columns={dailyColumns}
                  data={(data?.daily ?? []).filter(
                    (row) => row.request_count > 0 || row.net_quota !== 0
                  )}
                  getRowKey={(row) => row.day}
                  empty={
                    !data ||
                    data.daily.every(
                      (row) => row.request_count === 0 && row.net_quota === 0
                    )
                  }
                  emptyContent={t('No consumption in this range')}
                />
              </SideDrawerSection>
              <SideDrawerSection>
                <SideDrawerSectionHeader title={t('Model consumption')} />
                <StaticDataTable
                  columns={modelColumns}
                  data={data?.models ?? []}
                  getRowKey={(row) => row.model_name}
                  empty={!data || data.models.length === 0}
                  emptyContent={t('No consumption in this range')}
                />
              </SideDrawerSection>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
