import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEnterpriseSelf } from '@/features/enterprise-console/hooks/use-enterprise-self'
import { PeriodFilter } from '@/features/finance/components/period-filter'
import { ExportCsvControl } from '@/features/finance/components/usage-breakdown/export-csv-control'
import { useFinanceDateRange } from '@/features/finance/hooks/use-finance-date-range'
import { buildUsageCsvFilename } from '@/features/finance/lib/csv'
import {
  dayRangeToTimestamps,
  presetRange,
  type DatePresetId,
} from '@/features/finance/lib/date-presets'
import type { UsageRangeParams } from '@/features/finance/types'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useAuthStore } from '@/stores/auth-store'

import { CreditNotice } from './components/credit-notice'
import { TopupExportButton } from './components/topup-export-button'
import { TopupTab } from './components/topup-tab'
import { UsageTab } from './components/usage-tab'
import { RECONCILIATION_TAB_TITLE_KEYS, RECONCILIATION_TABS } from './constants'
import type { ReconciliationTab } from './types'

const route = getRouteApi('/_authenticated/reconciliation/')

/** 个人财务对账：账期内本人消耗与钱包流水，可导出对账单 */
export function ReconciliationPage() {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const username = useAuthStore((state) => state.auth.user?.username ?? '')
  const enterprise = useEnterpriseSelf()
  const tab: ReconciliationTab = search.tab ?? 'usage'
  const range = useFinanceDateRange({
    search,
    navigate,
    startKey: 'start',
    endKey: 'end',
    fallback: presetRange('month'),
    resetKeys: ['page'],
  })
  const timestamps = useMemo(
    () => dayRangeToTimestamps(range.applied),
    [range.applied]
  )
  const applyPreset = (preset: DatePresetId) => {
    const next = presetRange(preset)
    void navigate({
      search: (previous) => ({
        ...previous,
        start: next.start,
        end: next.end,
        page: undefined,
      }),
    })
  }
  const usageParams: UsageRangeParams = { scope: 'self', ...timestamps }
  const exportControl =
    tab === 'usage' ? (
      <ExportCsvControl
        {...usageParams}
        filename={buildUsageCsvFilename(
          username,
          range.applied.start,
          range.applied.end,
          t('usage')
        )}
      />
    ) : (
      <TopupExportButton
        {...timestamps}
        subject={username}
        startDay={range.applied.start}
        endDay={range.applied.end}
      />
    )

  const periodFilter = (
    <PeriodFilter
      range={range}
      presets={['month', 'lastMonth', 'last30']}
      onPreset={applyPreset}
    />
  )

  return (
    <SectionPageLayout stackActionsOnMobile>
      <SectionPageLayout.Title>{t('Reconciliation')}</SectionPageLayout.Title>
      {/* 页头 Actions 不随内容滚动：手机上把账期筛选放进内容区顶部 */}
      {!isMobile && (
        <SectionPageLayout.Actions>{periodFilter}</SectionPageLayout.Actions>
      )}
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          {isMobile && periodFilter}
          <p className='text-muted-foreground -mt-1 text-sm'>
            {t(
              'Consumption and wallet entries within the period, exportable as statements.'
            )}
          </p>
          <CreditNotice billingMode={enterprise.data?.billing_mode} />
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Tabs
              value={tab}
              onValueChange={(value) =>
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    tab: value as ReconciliationTab,
                    page: undefined,
                    source: undefined,
                  }),
                })
              }
            >
              <TabsList variant='line'>
                {RECONCILIATION_TABS.map((id) => (
                  <TabsTrigger key={id} value={id}>
                    {t(RECONCILIATION_TAB_TITLE_KEYS[id])}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {exportControl}
          </div>
          {tab === 'usage' ? (
            <UsageTab usageParams={usageParams} />
          ) : (
            <TopupTab {...timestamps} />
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
