import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { useAuthStore } from '@/stores/auth-store'

import { enterpriseSelfQueryOptions } from '../hooks/use-enterprise-self'
import { isEnterpriseAccount } from './member-roles'

/**
 * 企业账户的默认落地页是企业概览：登录后与直达 /dashboard 都从这里转走。
 * 登录跳转在 8 处写死了 /dashboard，这里在 dashboard 路由的 beforeLoad 统一接住，不逐处改。
 * 企业资料查询失败时按普通用户处理，不阻塞看板。
 */
export async function redirectEnterpriseAccountToOverview(
  queryClient: QueryClient
): Promise<void> {
  const userId = useAuthStore.getState().auth.user?.id
  if (userId === undefined) return
  const self = await queryClient
    .ensureQueryData(enterpriseSelfQueryOptions(userId))
    .catch(() => null)
  if (!isEnterpriseAccount(self?.actor)) return
  throw redirect({ to: '/enterprise/overview', replace: true })
}
