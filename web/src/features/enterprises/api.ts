import type {
  Bill,
  CreditPeriod,
  LedgerEntry,
  SellerProfile,
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

export async function listAdminBills(params: {
  enterprise_id?: number
  status?: string
  bill_type?: string
  overdue?: 'true'
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageData<Bill>>> {
  const res = await api.get('/api/admin/enterprise/bills', { params })
  return res.data
}

export async function registerBillPayment(
  id: number,
  payload: { amount_usd: number; reference: string; remark: string }
): Promise<ApiResponse<Bill>> {
  const res = await api.post(
    `/api/admin/enterprise/bills/${id}/payments`,
    payload
  )
  return res.data
}

export async function voidBill(
  id: number,
  remark: string
): Promise<ApiResponse> {
  const res = await api.post(`/api/admin/enterprise/bills/${id}/void`, {
    remark,
  })
  return res.data
}

export async function issueBillNow(
  periodId: number
): Promise<ApiResponse<Bill | null>> {
  const res = await api.post(
    `/api/admin/enterprise/credit-periods/${periodId}/issue`
  )
  return res.data
}

export async function getSellerProfile(): Promise<ApiResponse<SellerProfile>> {
  const res = await api.get('/api/admin/enterprise/settings/seller')
  return res.data
}

export async function updateSellerProfile(
  profile: SellerProfile
): Promise<ApiResponse> {
  const res = await api.put('/api/admin/enterprise/settings/seller', profile)
  return res.data
}
