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

/** 个人财务对账：本人消费账单与钱包流水 */
export const SELF_FINANCE_BASE = '/api/user/finance'

/** 用量接口按主体选路径与参数：admin 走财务中心并带 user_id，self 走个人对账 */
function usageRequest(params: UsageRangeParams, path: string) {
  const query: Record<string, number> = {
    ts_start: params.ts_start,
    ts_end: params.ts_end,
  }
  if (params.scope === 'admin') {
    query.user_id = params.user_id
    return { url: `${FINANCE_BASE}${path}`, query }
  }
  return { url: `${SELF_FINANCE_BASE}${path}`, query }
}

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
  const request = usageRequest(params, '/usage/summary')
  const res = await api.get(request.url, { params: request.query })
  return res.data
}

export async function getUsageDaily(
  params: UsageRangeParams
): Promise<ApiResponse<UsageDaily>> {
  const request = usageRequest(params, '/usage/daily')
  const res = await api.get(request.url, { params: request.query })
  return res.data
}

export async function listUsageDetail(
  params: UsageRangeParams & { p: number; page_size: number }
): Promise<ApiResponse<PagedData<UsageDetailRow>>> {
  const request = usageRequest(params, '/usage/detail')
  const res = await api.get(request.url, {
    params: { ...request.query, p: params.p, page_size: params.page_size },
  })
  return res.data
}

/** 导出 CSV：后端流式返回 blob；业务失败时返回 JSON（success=false），调用方按 content-type 区分 */
export async function downloadUsageExport(
  params: UsageRangeParams & { include_detail: boolean }
): Promise<Blob> {
  const request = usageRequest(params, '/usage/export')
  const res = await api.get(request.url, {
    params: { ...request.query, include_detail: params.include_detail },
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
