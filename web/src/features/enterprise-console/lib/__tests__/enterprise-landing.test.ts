import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ENTERPRISE_SELF_QUERY_KEY } from '../../hooks/use-enterprise-self'
import { redirectEnterpriseAccountToOverview } from '../enterprise-landing'

const authState = vi.hoisted(() => ({ userId: 1 as number | undefined }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ auth: { user: { id: authState.userId } } }),
  },
}))

const apiMock = vi.hoisted(() => ({ getEnterpriseSelf: vi.fn() }))
vi.mock('../../api', () => ({
  getEnterpriseSelf: apiMock.getEnterpriseSelf,
}))

afterEach(() => {
  apiMock.getEnterpriseSelf.mockReset()
  authState.userId = 1
})

describe('redirectEnterpriseAccountToOverview', () => {
  it('redirects the enterprise owner to the enterprise overview', async () => {
    apiMock.getEnterpriseSelf.mockResolvedValue({
      success: true,
      data: {
        id: 1,
        name: 'Acme',
        actor: { is_owner: true, provisioned: false },
      },
    })
    await expect(
      redirectEnterpriseAccountToOverview(new QueryClient())
    ).rejects.toMatchObject({
      options: { to: '/enterprise/overview', replace: true },
    })
  })

  it('lets ordinary users and failed lookups through to the dashboard', async () => {
    apiMock.getEnterpriseSelf.mockResolvedValue({ success: true, data: null })
    await expect(
      redirectEnterpriseAccountToOverview(new QueryClient())
    ).resolves.toBeUndefined()

    apiMock.getEnterpriseSelf.mockRejectedValue(new Error('network'))
    await expect(
      redirectEnterpriseAccountToOverview(
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      )
    ).resolves.toBeUndefined()
  })

  it('reuses the cached enterprise profile instead of refetching', async () => {
    const client = new QueryClient()
    client.setQueryData([...ENTERPRISE_SELF_QUERY_KEY, 1], {
      id: 1,
      name: 'Acme',
      actor: { is_owner: false, provisioned: true },
    })
    await expect(
      redirectEnterpriseAccountToOverview(client)
    ).rejects.toMatchObject({ options: { to: '/enterprise/overview' } })
    expect(apiMock.getEnterpriseSelf).not.toHaveBeenCalled()
  })
})
