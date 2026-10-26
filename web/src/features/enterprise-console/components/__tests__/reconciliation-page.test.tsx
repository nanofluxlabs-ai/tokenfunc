import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Bill } from '../../types'
import { EnterpriseReconciliation } from '../reconciliation-page'

// 路由 search 用可变对象模拟，navigate 只记录调用
const searchState: Record<string, unknown> = {}
const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => searchState,
    useNavigate: () => navigateMock,
  }),
  Link: (props: {
    to: string
    params?: Record<string, string>
    children?: unknown
    className?: string
  }) => (
    <a
      href={Object.entries(props.params ?? {}).reduce(
        (href, [key, value]) => href.replace(`$${key}`, value),
        props.to
      )}
      className={props.className}
    >
      {props.children as never}
    </a>
  ),
}))

const apiMock = vi.hoisted(() => ({
  listBills: vi.fn(),
  listCreditPeriods: vi.fn(),
  listLedger: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const selfState = vi.hoisted(() => ({
  billingMode: 'prepaid' as 'prepaid' | 'credit',
}))
vi.mock('../../hooks/use-enterprise-self', () => ({
  useEnterpriseSelf: () => ({
    data: {
      id: 1,
      name: 'Acme',
      billing_mode: selfState.billingMode,
      actor: {
        member_id: 0,
        role: 'enterprise_admin',
        team_id: 0,
        is_owner: true,
        provisioned: false,
      },
    },
    isLoading: false,
  }),
}))
// 消费账单与导出复用个人对账页 / 财务中心的组件，这里只验证它们收到企业主体
const usageTabMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/reconciliation/components/usage-tab', () => ({
  UsageTab: (props: { usageParams: { scope: string } }) => {
    usageTabMock(props.usageParams)
    return <div data-testid='usage-tab' />
  },
}))
vi.mock(
  '@/features/finance/components/usage-breakdown/export-csv-control',
  () => ({
    ExportCsvControl: () => <button type='button'>Export CSV</button>,
  })
)

function bill(id: number, billNo: string): Bill {
  return {
    id,
    bill_no: billNo,
    enterprise_id: 1,
    period_id: id,
    bill_type: 'credit',
    period_start: 1_759_276_800,
    period_end: 1_761_955_200,
    amount_quota: 500_000,
    amount_usd: '1.00',
    adjustment_usd: '0.00',
    total_usd: '1.00',
    paid_usd: '0.00',
    currency: 'USD',
    status: 'unpaid',
    issued_at: 1_761_955_200,
    due_at: 1_763_251_200,
    paid_at: 0,
    reminder_count: 0,
    reconcile_diff_quota: 0,
    reconcile_acked_at: 0,
    reconcile_acked_by: 0,
    reconcile_ack_note: '',
    prompt_tokens: 0,
    completion_tokens: 0,
    archive_info: null,
    archived_at: 0,
    usage_snapshot: null,
    seller_snapshot: null,
    buyer_snapshot: null,
    remark: '',
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <EnterpriseReconciliation />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  for (const key of Object.keys(searchState)) delete searchState[key]
  selfState.billingMode = 'prepaid'
  apiMock.listBills.mockResolvedValue({
    success: true,
    data: { items: [bill(7, 'INV-2025-10-001')], total: 21 },
  })
  apiMock.listCreditPeriods.mockResolvedValue({
    success: true,
    data: { items: [], total: 0 },
  })
  apiMock.listLedger.mockResolvedValue({
    success: true,
    data: { items: [], total: 0 },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EnterpriseReconciliation', () => {
  test('opens on period statements with bill links, a pager and no credit periods for a prepaid enterprise', async () => {
    renderPage()

    expect(
      await screen.findByRole('link', { name: 'INV-2025-10-001' })
    ).toHaveAttribute('href', '/enterprise/bills/7')
    // 与使用日志同一套分页条：总数 + 每页条数 + 翻页按钮
    expect(screen.getByText('Rows per page')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Go to next page' })
    ).toBeEnabled()
    expect(screen.queryByText('Credit Periods')).not.toBeInTheDocument()
    expect(apiMock.listCreditPeriods).not.toHaveBeenCalled()
    // 账期账单不按日期过滤，页头没有日期控件
    expect(
      screen.queryByRole('button', { name: 'Date Range' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Period statements' })
    ).toHaveAttribute('aria-selected', 'true')
  })

  test('shows the credit periods block above the bills for a credit enterprise', async () => {
    selfState.billingMode = 'credit'
    renderPage()

    expect(await screen.findByText('Credit Periods')).toBeInTheDocument()
    expect(await screen.findByText('No credit periods yet')).toBeInTheDocument()
    expect(apiMock.listCreditPeriods).toHaveBeenCalledWith({ page_size: 12 })
  })

  test('the wallet statement tab lists the enterprise ledger for the selected range with an empty state', async () => {
    searchState.tab = 'ledger'
    searchState.start = '2025-10-01'
    searchState.end = '2025-10-31'
    searchState.page = 2
    renderPage()

    expect(await screen.findByText('No ledger entries yet')).toBeInTheDocument()
    expect(apiMock.listLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        p: 2,
        page_size: 20,
        type: 'topup,adjustment,bill_issued,bill_payment,cross_period_adjustment',
      })
    )
    const call = apiMock.listLedger.mock.calls[0]?.[0] as {
      ts_start: number
      ts_end: number
    }
    expect(call.ts_end).toBeGreaterThan(call.ts_start)
    expect(
      screen.getByRole('button', { name: 'Date Range' })
    ).toBeInTheDocument()
    expect(apiMock.listBills).not.toHaveBeenCalled()
  })

  test('the consumption tab hands the enterprise subject to the shared usage tab and shows the export control', async () => {
    searchState.tab = 'usage'
    renderPage()

    expect(await screen.findByTestId('usage-tab')).toBeInTheDocument()
    expect(usageTabMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'enterprise' })
    )
    expect(
      screen.getByRole('button', { name: 'Export CSV' })
    ).toBeInTheDocument()
  })

  test('switching tab navigates with the tab and resets the page', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'INV-2025-10-001' })

    fireEvent.click(screen.getByRole('tab', { name: 'Wallet statement' }))

    expect(navigateMock).toHaveBeenCalled()
    const updater = navigateMock.mock.calls[0]?.[0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>
    expect(updater({ page: 3, start: '2025-10-01' })).toEqual({
      start: '2025-10-01',
      tab: 'ledger',
      page: undefined,
    })
  })
})
