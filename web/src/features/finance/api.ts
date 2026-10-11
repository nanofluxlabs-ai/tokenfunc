import { api } from '@/lib/api'

import type {
  ApiResponse,
  FinanceBillContext,
  FinanceBillKind,
  FinanceBillList,
  FinanceModelConsumptionRow,
  FinanceModelConsumptionSummary,
  FinanceOrder,
  FinanceOverview,
  FinanceUserConsumption,
  ListFinanceOrdersParams,
  ListModelConsumptionsParams,
  ListUserConsumptionsParams,
  PagedData,
  UsageDaily,
  UsageDetailRow,
  UsageRangeParams,
  UsageSummary,
} from './types'

const FINANCE_BASE = '/api/admin/finance'

export const FINANCE_USAGE_EXPORT_URL = `${FINANCE_BASE}/usage/export`

export async function getFinanceOverview(params: {
  start_date: string
  end_date: string
}): Promise<ApiResponse<FinanceOverview>> {
  const res = await api.get(`${FINANCE_BASE}/overview`, { params })
  return res.data
}

export async function listFinanceOrders(
  params: ListFinanceOrdersParams
): Promise<ApiResponse<PagedData<FinanceOrder>>> {
  const res = await api.get(`${FINANCE_BASE}/orders`, { params })
  return res.data
}

export async function listUserConsumptions(
  params: ListUserConsumptionsParams
): Promise<ApiResponse<PagedData<FinanceUserConsumption>>> {
  const res = await api.get(`${FINANCE_BASE}/user-consumptions`, { params })
  return res.data
}

export async function listModelConsumptions(
  params: ListModelConsumptionsParams
): Promise<
  ApiResponse<{
    items: FinanceModelConsumptionRow[]
    summary: FinanceModelConsumptionSummary
  }>
> {
  const res = await api.get(`${FINANCE_BASE}/model-consumptions`, { params })
  return res.data
}

export async function getUsageSummary(
  params: UsageRangeParams
): Promise<ApiResponse<UsageSummary>> {
  const res = await api.get(`${FINANCE_BASE}/usage/summary`, { params })
  return res.data
}

export async function getUsageDaily(
  params: UsageRangeParams
): Promise<ApiResponse<UsageDaily>> {
  const res = await api.get(`${FINANCE_BASE}/usage/daily`, { params })
  return res.data
}

export async function listUsageDetail(
  params: UsageRangeParams & { p: number; page_size: number }
): Promise<ApiResponse<PagedData<UsageDetailRow>>> {
  const res = await api.get(`${FINANCE_BASE}/usage/detail`, { params })
  return res.data
}

/** 导出 CSV：后端流式返回 blob；业务失败时返回 JSON（success=false），调用方按 content-type 区分 */
export async function downloadUsageExport(
  params: UsageRangeParams & { include_detail: boolean }
): Promise<Blob> {
  const res = await api.get(FINANCE_USAGE_EXPORT_URL, {
    params,
    responseType: 'blob',
  })
  return res.data
}

export async function listFinanceBills(params: {
  status?: string
  bill_type?: string
  overdue?: 'true'
  enterprise_id?: number
  include_open?: 1
  p: number
  page_size: number
}): Promise<ApiResponse<FinanceBillList>> {
  const res = await api.get(`${FINANCE_BASE}/bills`, { params })
  return res.data
}

export async function getFinanceBill(
  kind: FinanceBillKind,
  id: number
): Promise<ApiResponse<FinanceBillContext>> {
  const res = await api.get(`${FINANCE_BASE}/bills/${kind}/${id}`)
  return res.data
}
