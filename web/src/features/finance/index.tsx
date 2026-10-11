import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BillsAdminContent } from '@/features/enterprises'
import { getCurrencyLabel } from '@/lib/currency'

import { DayRangeControls } from './components/day-range-controls'
import { ModelConsumptionPanel } from './components/model-consumption/model-consumption-panel'
import { OrdersPanel } from './components/orders/orders-panel'
import { OverviewPanel } from './components/overview/overview-panel'
import { UserConsumptionPanel } from './components/user-consumption/user-consumption-panel'
import { useFinanceDateRange } from './hooks/use-finance-date-range'
import { monthToDateRange } from './lib/date-presets'
import {
  FINANCE_DEFAULT_SECTION,
  FINANCE_SECTION_IDS,
  FINANCE_SECTION_TITLE_KEYS,
  isFinanceSectionId,
  sectionUsesSharedRange,
  type FinanceSectionId,
} from './section-registry'

const route = getRouteApi('/_authenticated/finance/$section')

export function FinanceCenter() {
  const { t } = useTranslation()
  const params = route.useParams()
  const search = route.useSearch()
  const routeNavigate = route.useNavigate()
  const section: FinanceSectionId = isFinanceSectionId(params.section)
    ? params.section
    : FINANCE_DEFAULT_SECTION
  const sharedRange = useFinanceDateRange({
    search,
    navigate: routeNavigate,
    startKey: 'start',
    endKey: 'end',
    fallback: monthToDateRange(),
    resetKeys: ['page'],
  })
  const usesSharedRange = sectionUsesSharedRange(section)

  let panel: React.ReactNode = null
  switch (section) {
    case 'overview':
      panel = <OverviewPanel range={sharedRange.applied} />
      break
    case 'orders':
      panel = <OrdersPanel range={sharedRange.applied} />
      break
    case 'user-consumption':
      panel = <UserConsumptionPanel />
      break
    case 'model-consumption':
      panel = <ModelConsumptionPanel />
      break
    case 'enterprise-bills':
      panel = <BillsAdminContent />
      break
  }

  return (
    <SectionPageLayout stackActionsOnMobile>
      <SectionPageLayout.Title>{t('Finance Center')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <DayRangeControls
          draft={sharedRange.draft}
          onDraftChange={sharedRange.setDraft}
          onApply={sharedRange.apply}
          onReset={sharedRange.reset}
          disabled={!usesSharedRange}
        />
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <p className='text-muted-foreground -mt-1 text-sm'>
            {t(
              'View top-ups, subscription orders, user consumption and business trends in one place.'
            )}
          </p>
          <Alert className='bg-muted/40'>
            <AlertDescription>
              {t(
                'Amounts are totaled in the site display currency ({{currency}}). All-user and paying-user consumption are both net of refunds. Paying users are enterprise accounts and users with a successful order; administrators are excluded. Historical registrations are only counted accurately after the registration timestamp field was enabled.',
                { currency: getCurrencyLabel() }
              )}
            </AlertDescription>
          </Alert>
          <Tabs
            value={section}
            onValueChange={(value) =>
              void routeNavigate({
                to: '/finance/$section',
                params: { section: value as FinanceSectionId },
                search: true,
              })
            }
          >
            <TabsList
              variant='line'
              className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'
            >
              {FINANCE_SECTION_IDS.map((id) => (
                <TabsTrigger key={id} value={id}>
                  {t(FINANCE_SECTION_TITLE_KEYS[id])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {panel}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
