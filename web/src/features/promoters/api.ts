import { ADMIN_PROMOTER_BASE } from '@/features/promoter-center/api'
import type { PromoterRangeParams } from '@/features/promoter-center/types'
import { api } from '@/lib/api'

import type {
  ApiResponse,
  MarkSettledPayload,
  PagedData,
  PromoterBindResult,
  PromoterBindingsResponse,
  PromoterEditableFields,
  PromoterListItem,
  PromoterProfile,
} from './types'

export async function listPromoters(params: {
  keyword?: string
  p: number
  page_size: number
}): Promise<ApiResponse<PagedData<PromoterListItem>>> {
  const res = await api.get(ADMIN_PROMOTER_BASE, { params })
  return res.data
}

export async function createPromoter(
  payload: PromoterEditableFields & { user_id: number }
): Promise<ApiResponse<PromoterProfile>> {
  const res = await api.post(ADMIN_PROMOTER_BASE, payload)
  return res.data
}

export async function updatePromoter(
  id: number,
  payload: PromoterEditableFields
): Promise<ApiResponse<PromoterProfile>> {
  const res = await api.put(`${ADMIN_PROMOTER_BASE}/${id}`, payload)
  return res.data
}

export async function removePromoter(
  id: number
): Promise<ApiResponse<{ unbound_count: number }>> {
  const res = await api.delete(`${ADMIN_PROMOTER_BASE}/${id}`)
  return res.data
}

/** 绑定列表 = 管理员视图的名下用户（含邮箱 / 分组 / 操作人），区间缺省本月 */
export async function listPromoterBindings(
  id: number,
  range?: PromoterRangeParams
): Promise<ApiResponse<PromoterBindingsResponse>> {
  const res = await api.get(`${ADMIN_PROMOTER_BASE}/${id}/bindings`, {
    params: range,
  })
  return res.data
}

export async function bindPromoterUsers(
  id: number,
  payload: { inputs: string[]; include_history: boolean }
): Promise<ApiResponse<PromoterBindResult>> {
  const res = await api.post(`${ADMIN_PROMOTER_BASE}/${id}/bindings`, payload)
  return res.data
}

export async function unbindPromoterUser(
  id: number,
  userId: number
): Promise<ApiResponse> {
  const res = await api.delete(
    `${ADMIN_PROMOTER_BASE}/${id}/bindings/${userId}`
  )
  return res.data
}

export async function markPromoterSettled(
  id: number,
  payload: MarkSettledPayload
): Promise<ApiResponse> {
  const res = await api.post(
    `${ADMIN_PROMOTER_BASE}/${id}/settlements`,
    payload
  )
  return res.data
}

export async function revertPromoterSettlement(
  id: number,
  month: string
): Promise<ApiResponse> {
  const res = await api.delete(
    `${ADMIN_PROMOTER_BASE}/${id}/settlements/${month}`
  )
  return res.data
}
