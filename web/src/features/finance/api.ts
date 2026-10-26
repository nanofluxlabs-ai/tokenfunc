import { api } from '@/lib/api'

import type {
  ApiResponse,
  BillArchiveFile,
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

/** 企业财务对账：企业钱包的消费账单，后端从企业上下文取 user_id */
export const ENTERPRISE_FINANCE_BASE = '/api/enterprise/finance'

/** 用量接口按主体选路径与参数：admin 走财务中心并带 user_id，enterprise 走企业控制台，self 走个人对账 */
export function usageRequest(params: UsageRangeParams, path: string) {
  const query: Record<string, number> = {
    ts_start: params.ts_start,
    ts_end: params.ts_end,
  }
  if (params.scope === 'self') {
    return { url: `${SELF_FINANCE_BASE}${path}`, query }
  }
  if (params.bill_id) {
    query.bill_id = params.bill_id
  }
  if (params.scope === 'admin') {
    query.user_id = params.user_id
    return { url: `${FINANCE_BASE}${path}`, query }
  }
  return { url: `${ENTERPRISE_FINANCE_BASE}${path}`, query }
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

/**
 * 财务中心账单列表。status 一个参数覆盖全部口径：空 = 账期 + 账单；open / closing 只看账期；
 * overdue / statement / reconcile 看账单的逾期 / 月度对账单 / 对账差异；其余按账单状态
 */
export async function listFinanceBills(params: {
  status?: string
  enterprise_name?: string
  bill_no?: string
  enterprise_id?: number
  include_open?: 0 | 1
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

/** 手动（重新）归档一张已出账账单的账期包到对象存储 */
export async function archiveFinanceBill(
  id: number
): Promise<ApiResponse<{ bill_id: number; archived_at: number }>> {
  const res = await api.post(`${FINANCE_BASE}/bill-archives/${id}`)
  return res.data
}

/** 下载账期包里的一个对象（.csv.gz，服务端从对象存储透传） */
export async function downloadFinanceBillArchive(
  id: number,
  file: BillArchiveFile
): Promise<Blob> {
  const res = await api.get(`${FINANCE_BASE}/bill-archives/${id}/${file}`, {
    responseType: 'blob',
  })
  return res.data
}
