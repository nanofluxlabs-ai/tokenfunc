import { useQuery } from '@tanstack/react-query'

import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { getPromoterSelf } from '../api'
import { PROMOTER_QUERY_KEY } from '../constants'

export const PROMOTER_SELF_QUERY_KEY = [PROMOTER_QUERY_KEY, 'self'] as const

/** 当前登录用户的推广人档案；非推广人为 null（侧边栏显隐、钱包卡与页面守卫共用） */
export function usePromoterSelf() {
  const userId = useAuthStore((state) => state.auth.user?.id)
  return useQuery({
    queryKey: [...PROMOTER_SELF_QUERY_KEY, userId],
    queryFn: async () =>
      requireServerSuccess(await getPromoterSelf()).data ?? null,
    enabled: userId !== undefined,
    staleTime: 5 * 60 * 1000,
    meta: { errorToast: false },
  })
}
