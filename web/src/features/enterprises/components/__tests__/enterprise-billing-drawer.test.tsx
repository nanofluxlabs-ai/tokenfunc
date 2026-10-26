import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { EnterpriseListItem } from '../../types'
import { EnterpriseBillingDrawer } from '../enterprise-billing-drawer'
import { EnterprisesProvider, useEnterprises } from '../enterprises-provider'

const apiMock = vi.hoisted(() => ({
  adminUsageExportUrl: vi.fn(() => '/export'),
  getEnterprise: vi.fn(),
  getEnterpriseUsageSummary: vi.fn(),
  issueBillNow: vi.fn(),
  listEnterpriseCreditPeriods: vi.fn(),
  openCreditPeriod: vi.fn(),
  setEnterpriseStatus: vi.fn(),
  createEnterpriseAdjustment: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

// 抽屉内嵌用量报表面板；jsdom 下不渲染真实图表
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: false }),
}))

vi.mock('@/features/auth/secure-verification', () => ({
  useSecureVerification: () => ({
    requestVerification: vi.fn(),
    isActive: false,
    dialogProps: {},
  }),
  SecureVerificationDialog: () => null,
}))

const row = {
  id: 5,
  user_id: 42,
  name: 'Acme',
  billing_mode: 'credit',
  status: 'active',
  period_limit_quota: 0,
  period_used_quota: 0,
} as EnterpriseListItem

function OpenProbe() {
  const { open } = useEnterprises()
  return <output data-testid='open-state'>{open ?? 'none'}</output>
}

beforeEach(() => {
  apiMock.getEnterprise.mockResolvedValue({ success: true, data: row })
  apiMock.listEnterpriseCreditPeriods.mockResolvedValue({
    success: true,
    data: { items: [], total: 0 },
  })
  apiMock.getEnterpriseUsageSummary.mockResolvedValue({
    success: true,
    data: { items: [], total_quota: 0, total_count: 0 },
  })
})

afterEach(() => {
  for (const mock of Object.values(apiMock)) mock.mockReset()
})

test('the account section opens the edit drawer of the same enterprise to change billing settings', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <EnterprisesProvider>
        <EnterpriseBillingDrawer
          open
          onOpenChange={() => undefined}
          currentRow={row}
        />
        <OpenProbe />
      </EnterprisesProvider>
    </QueryClientProvider>
  )

  await userEvent.click(
    await screen.findByRole('button', { name: 'Change billing settings' })
  )

  expect(screen.getByTestId('open-state')).toHaveTextContent('update')
  // 授信配置与切回预付已移到编辑抽屉
  expect(
    screen.queryByRole('button', { name: 'Switch to prepaid' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByLabelText('Credit limit per period (USD)')
  ).not.toBeInTheDocument()
})
