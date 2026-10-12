import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEnterpriseSelf } from '@/features/enterprise-console/hooks/use-enterprise-self'
import { DatePresetButtons } from '@/features/finance/components/date-preset-buttons'
import { DayRangeControls } from '@/features/finance/components/day-range-controls'
import { useFinanceDateRange } from '@/features/finance/hooks/use-finance-date-range'
import {
  dayRangeToTimestamps,
  presetRange,
  type DatePresetId,
} from '@/features/finance/lib/date-presets'
import { useAuthStore } from '@/stores/auth-store'

import { CreditNotice } from './components/credit-notice'
import { TopupTab } from './components/topup-tab'
import { UsageTab } from './components/usage-tab'
import { RECONCILIATION_TAB_TITLE_KEYS, RECONCILIATION_TABS } from './constants'
import type { ReconciliationTab } from './types'

const route = getRouteApi('/_authenticated/reconciliation/')

/** 个人财务对账：账期内本人消耗与钱包流水，可导出对账单 */
export function ReconciliationPage() {
  const { t } = useTranslation()
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
  const tabProps = {
    ...timestamps,
    subject: username,
    startDay: range.applied.start,
    endDay: range.applied.end,
  }

  return (
    <SectionPageLayout stackActionsOnMobile>
      <SectionPageLayout.Title>{t('Reconciliation')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          <DatePresetButtons
            presets={['month', 'lastMonth', 'last30']}
            onSelect={applyPreset}
          />
          <DayRangeControls
            draft={range.draft}
            onDraftChange={range.setDraft}
            onApply={range.apply}
            onReset={range.reset}
          />
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <p className='text-muted-foreground -mt-1 text-sm'>
            {t(
              'Consumption and wallet entries within the period, exportable as statements.'
            )}
          </p>
          <CreditNotice billingMode={enterprise.data?.billing_mode} />
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
          {tab === 'usage' ? (
            <UsageTab {...tabProps} />
          ) : (
            <TopupTab {...tabProps} />
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
