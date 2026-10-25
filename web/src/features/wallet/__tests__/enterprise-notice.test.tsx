import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { Wallet } from '../index'

// 企业主判定只依赖 useEnterpriseSelf 的返回，三种状态在用例里切换
const useEnterpriseSelfMock = vi.fn()
vi.mock('@/features/enterprise-console/hooks/use-enterprise-self', () => ({
  useEnterpriseSelf: () => useEnterpriseSelfMock(),
}))

// 支付相关 hooks 不是本用例的被测对象，全部给惰性返回值，避免发请求与弹窗
vi.mock('../hooks', () => ({
  useTopupInfo: () => ({ topupInfo: null, presetAmounts: [], loading: false }),
  usePayment: () => ({
    amount: 0,
    calculating: false,
    processing: false,
    calculatePaymentAmount: vi.fn(),
    processPayment: vi.fn(),
  }),
  useAffiliate: () => ({
    affiliateLink: '',
    loading: false,
    transferQuota: vi.fn(),
    transferring: false,
  }),
  useRedemption: () => ({ redeeming: false, redeemCode: vi.fn() }),
  useCreemPayment: () => ({ processing: false, processCreemPayment: vi.fn() }),
  useWaffoPayment: () => ({ processing: false, processWaffoPayment: vi.fn() }),
  useWaffoPancakePayment: () => ({
    processing: false,
    processWaffoPancakePayment: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: null, loading: false, error: null }),
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    currency: { quotaDisplayType: 'USD', usdExchangeRate: 1 },
  }),
}))

type EnterpriseSelfState = {
  data: { id: number; name: string; actor: { is_owner: boolean } } | null
  isLoading: boolean
}

const ownerSelf = { id: 7, name: 'Acme', actor: { is_owner: true } }
// 绑定了登录账号的成员：有企业身份但不是主账号，钱包与普通用户一致
const memberSelf = { id: 7, name: 'Acme', actor: { is_owner: false } }

async function renderWallet(state: EnterpriseSelfState) {
  useEnterpriseSelfMock.mockReturnValue(state)
  // 非企业分支会渲染订阅卡并拉取套餐 / 自身订阅，给空数据让它走"无套餐"路径
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/subscription/plans') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/subscription/self') {
      return {
        data: {
          success: true,
          data: { subscriptions: [], all_subscriptions: [] },
        },
      }
    }
    return {
      data: {
        success: true,
        data: {
          id: 1,
          username: 'owner',
          quota: 0,
          used_quota: 0,
          request_count: 0,
          aff_quota: 0,
          aff_history_quota: 0,
        },
      },
    }
  })
  const root = createRootRoute()
  const wallet = createRoute({
    getParentRoute: () => root,
    path: '/wallet',
    component: () => <Wallet />,
  })
  const overview = createRoute({
    getParentRoute: () => root,
    path: '/enterprise/overview',
    component: () => <div>overview</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([wallet, overview]),
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByText('Wallet')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useEnterpriseSelfMock.mockReset()
})

test('enterprise owner sees the offline top-up notice instead of recharge, subscription and referral cards', async () => {
  await renderWallet({ data: ownerSelf, isLoading: false })

  expect(
    await screen.findByText('Enterprise accounts are topped up offline')
  ).toBeVisible()
  // Button render={<Link/>} 产出 <a role="button">，按钮语义 + 可导航的 href
  const link = screen.getByRole('button', { name: 'Go to enterprise overview' })
  expect(link).toHaveAttribute('href', '/enterprise/overview')
  expect(screen.queryByText('Add Funds')).not.toBeInTheDocument()
  expect(document.querySelector('#wallet-add-funds')).toBeNull()
})

test('non-enterprise user keeps the recharge card and never sees the notice', async () => {
  await renderWallet({ data: null, isLoading: false })

  expect(await screen.findByText('Add Funds')).toBeInTheDocument()
  expect(document.querySelector('#wallet-add-funds')).not.toBeNull()
  expect(
    screen.queryByText('Enterprise accounts are topped up offline')
  ).not.toBeInTheDocument()
})

test('enterprise member account keeps the recharge card like a personal user', async () => {
  await renderWallet({ data: memberSelf, isLoading: false })

  expect(await screen.findByText('Add Funds')).toBeInTheDocument()
  expect(
    screen.queryByText('Enterprise accounts are topped up offline')
  ).not.toBeInTheDocument()
})

test('while the enterprise lookup is loading neither the cards nor the notice render', async () => {
  await renderWallet({ data: null, isLoading: true })

  expect(screen.queryByText('Add Funds')).not.toBeInTheDocument()
  expect(
    screen.queryByText('Enterprise accounts are topped up offline')
  ).not.toBeInTheDocument()
})
