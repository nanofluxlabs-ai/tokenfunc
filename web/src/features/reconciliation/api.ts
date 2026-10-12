import { SELF_FINANCE_BASE } from '@/features/finance/api'
import { api } from '@/lib/api'

import type { ApiResponse, PagedData, TopupEntry, TopupSummary } from './types'

export type TopupRangeParams = { ts_start: number; ts_end: number }

export async function getTopupSummary(
  params: TopupRangeParams
): Promise<ApiResponse<TopupSummary>> {
  const res = await api.get(`${SELF_FINANCE_BASE}/topup/summary`, { params })
  return res.data
}

export async function listTopupDetail(
  params: TopupRangeParams & { source?: string; p: number; page_size: number }
): Promise<ApiResponse<PagedData<TopupEntry>>> {
  const res = await api.get(`${SELF_FINANCE_BASE}/topup/detail`, { params })
  return res.data
}

/** 导出钱包流水 CSV；业务失败时后端返回 JSON，调用方按 blob 类型区分 */
export async function downloadTopupExport(
  params: TopupRangeParams
): Promise<Blob> {
  const res = await api.get(`${SELF_FINANCE_BASE}/topup/export`, {
    params,
    responseType: 'blob',
  })
  return res.data
}
