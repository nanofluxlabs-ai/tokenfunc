import { api } from '@/lib/api'

import type {
  ApiResponse,
  PromoterCenterModels,
  PromoterCenterOverview,
  PromoterCenterRange,
  PromoterCenterUser,
  PromoterCenterUserUsage,
  PromoterProfile,
  PromoterRangeParams,
  PromoterScope,
} from './types'

export const PROMOTER_SELF_BASE = '/api/promoter'
export const ADMIN_PROMOTER_BASE = '/api/admin/promoter/promoters'

/** 推广中心接口按主体切前缀：self 走本人，admin 带推广人 id */
export function promoterCenterUrl(scope: PromoterScope, path: string): string {
  if (scope.scope === 'admin') {
    return `${ADMIN_PROMOTER_BASE}/${scope.promoterId}/center${path}`
  }
  return `${PROMOTER_SELF_BASE}/center${path}`
}

export async function getPromoterSelf(): Promise<
  ApiResponse<PromoterProfile | null>
> {
  const res = await api.get(`${PROMOTER_SELF_BASE}/self`)
  return res.data
}

export async function getPromoterOverview(
  scope: PromoterScope,
  range: PromoterRangeParams
): Promise<ApiResponse<PromoterCenterOverview>> {
  const res = await api.get(promoterCenterUrl(scope, '/overview'), {
    params: range,
  })
  return res.data
}

export async function listPromoterUsers(
  scope: PromoterScope,
  range: PromoterRangeParams
): Promise<
  ApiResponse<{ range: PromoterCenterRange; items: PromoterCenterUser[] }>
> {
  const res = await api.get(promoterCenterUrl(scope, '/users'), {
    params: range,
  })
  return res.data
}

export async function listPromoterModels(
  scope: PromoterScope,
  range: PromoterRangeParams
): Promise<ApiResponse<PromoterCenterModels>> {
  const res = await api.get(promoterCenterUrl(scope, '/models'), {
    params: range,
  })
  return res.data
}

export async function getPromoterUserUsage(
  scope: PromoterScope,
  userId: number,
  range: PromoterRangeParams
): Promise<ApiResponse<PromoterCenterUserUsage>> {
  const res = await api.get(
    promoterCenterUrl(scope, `/users/${userId}/usage`),
    { params: range }
  )
  return res.data
}
