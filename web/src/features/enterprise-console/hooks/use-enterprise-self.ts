import { queryOptions, useQuery } from '@tanstack/react-query'

import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { getEnterpriseSelf } from '../api'

export const ENTERPRISE_SELF_QUERY_KEY = ['enterprise', 'self'] as const

/** 当前登录用户的企业资料查询；hook 与路由 beforeLoad 共用同一份 key / 缓存 */
export function enterpriseSelfQueryOptions(userId: number | undefined) {
  return queryOptions({
    queryKey: [...ENTERPRISE_SELF_QUERY_KEY, userId],
    queryFn: async () =>
      requireServerSuccess(await getEnterpriseSelf()).data ?? null,
    enabled: userId !== undefined,
    staleTime: 5 * 60 * 1000,
    meta: { errorToast: false },
  })
}

/** 当前登录用户的企业资料；非企业用户为 null */
export function useEnterpriseSelf() {
  const userId = useAuthStore((state) => state.auth.user?.id)
  return useQuery(enterpriseSelfQueryOptions(userId))
}
