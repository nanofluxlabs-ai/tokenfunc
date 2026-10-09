import type {
  CreditPeriod,
  LedgerEntry,
  UsageGroupBy,
  UsageSummary,
  PageData,
} from '@/features/enterprise-console/types'
import { api } from '@/lib/api'

import type {
  ApiResponse,
  CreateEnterprisePayload,
  CreditConfigPayload,
  Enterprise,
  EnterpriseProfilePayload,
  EnterpriseStatus,
  ListEnterprisesParams,
  ListEnterprisesResponse,
  TopupPayload,
} from './types'

const ADMIN_ENTERPRISE_BASE = '/api/admin/enterprise/enterprises'

export async function listEnterprises(
  params: ListEnterprisesParams
): Promise<ListEnterprisesResponse> {
  const res = await api.get(ADMIN_ENTERPRISE_BASE, { params })
  return res.data
}

export async function getEnterprise(
  id: number
): Promise<ApiResponse<Enterprise>> {
  const res = await api.get(`${ADMIN_ENTERPRISE_BASE}/${id}`)
  return res.data
}

export async function createEnterprise(
  payload: CreateEnterprisePayload
): Promise<ApiResponse<Enterprise>> {
  const res = await api.post(ADMIN_ENTERPRISE_BASE, payload)
  return res.data
}

export async function updateEnterprise(
  id: number,
  payload: EnterpriseProfilePayload
): Promise<ApiResponse> {
  const res = await api.put(`${ADMIN_ENTERPRISE_BASE}/${id}`, payload)
  return res.data
}

export async function configureEnterpriseCredit(
  id: number,
  payload: CreditConfigPayload
): Promise<ApiResponse> {
  const res = await api.put(`${ADMIN_ENTERPRISE_BASE}/${id}/credit`, payload)
  return res.data
}

export async function disableEnterpriseCredit(
  id: number
): Promise<ApiResponse> {
  const res = await api.delete(`${ADMIN_ENTERPRISE_BASE}/${id}/credit`)
  return res.data
}

export async function setEnterpriseStatus(
  id: number,
  status: EnterpriseStatus
): Promise<ApiResponse> {
  const res = await api.put(`${ADMIN_ENTERPRISE_BASE}/${id}/status`, { status })
  return res.data
}

export async function registerEnterpriseTopup(
  id: number,
  payload: TopupPayload
): Promise<ApiResponse<LedgerEntry>> {
  const res = await api.post(`${ADMIN_ENTERPRISE_BASE}/${id}/topup`, payload)
  return res.data
}

export async function listEnterpriseLedger(
  id: number,
  params: { p?: number; page_size?: number }
): Promise<ApiResponse<PageData<LedgerEntry>>> {
  const res = await api.get(`${ADMIN_ENTERPRISE_BASE}/${id}/ledger`, { params })
  return res.data
}

export async function listEnterpriseCreditPeriods(
  id: number,
  params: { p?: number; page_size?: number }
): Promise<ApiResponse<PageData<CreditPeriod>>> {
  const res = await api.get(`${ADMIN_ENTERPRISE_BASE}/${id}/credit-periods`, {
    params,
  })
  return res.data
}

export async function getEnterpriseUsageSummary(
  id: number,
  params: { group_by: UsageGroupBy; from: string; to: string }
): Promise<ApiResponse<UsageSummary>> {
  const res = await api.get(`${ADMIN_ENTERPRISE_BASE}/${id}/usage/summary`, {
    params,
  })
  return res.data
}

export function adminUsageExportUrl(id: number): string {
  return `${ADMIN_ENTERPRISE_BASE}/${id}/usage/export`
}
