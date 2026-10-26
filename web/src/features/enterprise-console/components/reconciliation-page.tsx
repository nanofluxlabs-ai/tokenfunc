import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { SimplePager } from '@/components/simple-pager'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DatePresetButtons } from '@/features/finance/components/date-preset-buttons'
import { DayRangeControls } from '@/features/finance/components/day-range-controls'
import { SectionBlock } from '@/features/finance/components/section-block'
import { ExportCsvControl } from '@/features/finance/components/usage-breakdown/export-csv-control'
import { useFinanceDateRange } from '@/features/finance/hooks/use-finance-date-range'
import { buildUsageCsvFilename } from '@/features/finance/lib/csv'
import {
  dayRangeToTimestamps,
  presetRange,
  type DatePresetId,
} from '@/features/finance/lib/date-presets'
import type { UsageRangeParams } from '@/features/finance/types'
import { UsageTab } from '@/features/reconciliation/components/usage-tab'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listBills, listCreditPeriods, listLedger } from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import {
  ENTERPRISE_RECONCILIATION_TABS,
  type EnterpriseReconciliationTab,
} from '../lib/reconciliation-search'
import { CreditPeriodsTable, LedgerTable } from './billing-tables'
import { BillsTable } from './bills-table'
import { EnterpriseGuard } from './enterprise-guard'
import { EnterpriseRoleBadge } from './enterprise-role-badge'

const PAGE_SIZE = 20
const route = getRouteApi('/_authenticated/enterprise/bills/')
/** 充值账单只列资金变动：线下充值、调整、出账、收款、跨期差额；授信配置变更是配置记录不进账单 */
const WALLET_LEDGER_TYPES = [
  'topup',
  'adjustment',
  'bill_issued',
  'bill_payment',
  'cross_period_adjustment',
].join(',')

const TAB_TITLE_KEYS: Record<EnterpriseReconciliationTab, string> = {
  statements: 'Period statements',
  usage: 'Consumption statement',
  ledger: 'Wallet statement',
}

/** 账期账单：授信企业先列账期，再列已出账账单（授信账单与月度对账单同一张表，类型作一列） */
function StatementsTab(props: {
  isCredit: boolean
  page: number
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation()
  const bills = useQuery({
    queryKey: ['enterprise', 'bills', 'list', props.page],
    queryFn: async () =>
      requireServerSuccess(
        await listBills({ p: props.page, page_size: PAGE_SIZE })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const periods = useQuery({
    queryKey: ['enterprise', 'credit-periods'],
    queryFn: async () =>
      requireServerSuccess(await listCreditPeriods({ page_size: 12 })).data
        ?.items ?? [],
    enabled: props.isCredit,
  })
  return (
    <div className='flex flex-col gap-4'>
      {props.isCredit && (
        <SectionBlock title={t('Credit Periods')}>
          <CreditPeriodsTable
            periods={periods.data ?? []}
            isLoading={periods.isLoading}
          />
        </SectionBlock>
      )}
      <BillsTable
        bills={bills.data?.items ?? []}
        isLoading={bills.isLoading}
        exportScope='enterprise'
        renderBillNo={(bill) => (
          <Link
            to='/enterprise/bills/$id'
            params={{ id: String(bill.id) }}
            className='hover:underline'
          >
            {bill.bill_no}
          </Link>
        )}
      />
      <SimplePager
        page={props.page}
        pageSize={PAGE_SIZE}
        total={bills.data?.total ?? 0}
        onPageChange={props.onPageChange}
      />
    </div>
  )
}

/** 充值账单：企业账本（线下充值登记、调整、出账与收款），按页头日期区间过滤 */
function LedgerTab(props: {
  ts_start: number
  ts_end: number
  page: number
  onPageChange: (page: number) => void
}) {
  const ledger = useQuery({
    queryKey: [
      'enterprise',
      'ledger',
      'range',
      props.ts_start,
      props.ts_end,
      props.page,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listLedger({
          p: props.page,
          page_size: PAGE_SIZE,
          ts_start: props.ts_start,
          ts_end: props.ts_end,
          type: WALLET_LEDGER_TYPES,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  return (
    <div className='flex flex-col gap-4'>
      <LedgerTable
        entries={ledger.data?.items ?? []}
        isLoading={ledger.isLoading}
      />
      <SimplePager
        page={props.page}
        pageSize={PAGE_SIZE}
        total={ledger.data?.total ?? 0}
        onPageChange={props.onPageChange}
      />
    </div>
  )
}

/** 企业财务对账：账期账单 / 消费账单 / 充值账单；消费与充值按企业钱包取数，与个人对账页同一套控件 */
export function EnterpriseReconciliation() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const self = useEnterpriseSelf()
  const tab: EnterpriseReconciliationTab = search.tab ?? 'statements'
  const page = search.page ?? 1
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
  const setPage = (next: number) =>
    void navigate({
      search: (previous) => ({
        ...previous,
        page: next <= 1 ? undefined : next,
      }),
    })
  const usageParams: UsageRangeParams = { scope: 'enterprise', ...timestamps }

  return (
    <SectionPageLayout stackActionsOnMobile>
      <SectionPageLayout.Title>
        <span className='flex items-center gap-2'>
          {t('Reconciliation')}
          <EnterpriseRoleBadge />
        </span>
      </SectionPageLayout.Title>
      {tab !== 'statements' && (
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
      )}
      <SectionPageLayout.Content>
        <EnterpriseGuard>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Tabs
                value={tab}
                onValueChange={(value) =>
                  void navigate({
                    search: (previous) => ({
                      ...previous,
                      tab: value as EnterpriseReconciliationTab,
                      page: undefined,
                    }),
                  })
                }
              >
                <TabsList variant='line'>
                  {ENTERPRISE_RECONCILIATION_TABS.map((id) => (
                    <TabsTrigger key={id} value={id}>
                      {t(TAB_TITLE_KEYS[id])}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {tab === 'usage' && (
                <ExportCsvControl
                  {...usageParams}
                  filename={buildUsageCsvFilename(
                    self.data?.name ?? 'enterprise',
                    range.applied.start,
                    range.applied.end,
                    t('usage')
                  )}
                />
              )}
            </div>
            {tab === 'statements' && (
              <StatementsTab
                isCredit={self.data?.billing_mode === 'credit'}
                page={page}
                onPageChange={setPage}
              />
            )}
            {tab === 'usage' && <UsageTab usageParams={usageParams} />}
            {tab === 'ledger' && (
              <LedgerTab {...timestamps} page={page} onPageChange={setPage} />
            )}
          </div>
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
