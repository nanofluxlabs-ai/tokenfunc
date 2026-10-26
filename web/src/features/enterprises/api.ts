import type {
  Bill,
  CreditPeriod,
  LedgerEntry,
  Member,
  SellerProfile,
  UsageGroupBy,
  UsageSummary,
  PageData,
} from '@/features/enterprise-console/types'
import { api, securityProofConfig } from '@/lib/api'

import type {
  AdjustmentKind,
  AdjustmentPayload,
  ApiResponse,
  TrialLead,
  CreateEnterprisePayload,
  CreditConfigPayload,
  Enterprise,
  EnterpriseGroupOption,
  EnterpriseStatus,
  ListEnterpriseMembersParams,
  ListEnterprisesParams,
  ListEnterprisesResponse,
  UpdateEnterprisePayload,
} from './types'

const ADMIN_ENTERPRISE_BASE = '/api/admin/enterprise/enterprises'

export async function listEnterprises(
  params: ListEnterprisesParams
): Promise<ListEnterprisesResponse> {
  const res = await api.get(ADMIN_ENTERPRISE_BASE, { params })
  return res.data
}

/** 管理员只读查看某企业的成员，范围为全企业 */
export async function listEnterpriseMembers(
  id: number,
  params: ListEnterpriseMembersParams
): Promise<ApiResponse<PageData<Member>>> {
  const res = await api.get(`${ADMIN_ENTERPRISE_BASE}/${id}/members`, {
    params,
  })
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
  payload: UpdateEnterprisePayload
): Promise<ApiResponse> {
  const res = await api.put(`${ADMIN_ENTERPRISE_BASE}/${id}`, payload)
  return res.data
}

export async function listEnterpriseGroupOptions(): Promise<
  ApiResponse<EnterpriseGroupOption[]>
> {
  const res = await api.get('/api/admin/enterprise/group-options')
  return res.data
}

/**
 * 开通或修改授信；需要 `admin.user.manage` + action `enterprise_credit`
 * 绑定企业主 user_id 的二次验证凭证
 */
export async function configureEnterpriseCredit(
  id: number,
  payload: CreditConfigPayload,
  proofToken: string
): Promise<ApiResponse> {
  const res = await api.put(
    `${ADMIN_ENTERPRISE_BASE}/${id}/credit`,
    payload,
    securityProofConfig(proofToken)
  )
  return res.data
}

/** 切回预付；二次验证同 configureEnterpriseCredit */
export async function disableEnterpriseCredit(
  id: number,
  proofToken: string
): Promise<ApiResponse> {
  const res = await api.delete(
    `${ADMIN_ENTERPRISE_BASE}/${id}/credit`,
    securityProofConfig(proofToken)
  )
  return res.data
}

export async function setEnterpriseStatus(
  id: number,
  status: EnterpriseStatus
): Promise<ApiResponse> {
  const res = await api.put(`${ADMIN_ENTERPRISE_BASE}/${id}/status`, { status })
  return res.data
}

/**
 * 人工调账（余额 / 账单）；需要 `admin.user.manage` + action `enterprise_adjust`
 * 绑定企业主 user_id 的二次验证凭证
 */
export async function createEnterpriseAdjustment(
  id: number,
  payload: AdjustmentPayload,
  proofToken: string
): Promise<
  ApiResponse<{ kind: AdjustmentKind; ledger: LedgerEntry; bill?: Bill }>
> {
  const res = await api.post(
    `${ADMIN_ENTERPRISE_BASE}/${id}/adjustments`,
    payload,
    securityProofConfig(proofToken)
  )
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

/** 额度信用待收款期间手动开下一期（提前放行 / 账单作废后恢复） */
export async function openCreditPeriod(
  id: number
): Promise<ApiResponse<CreditPeriod>> {
  const res = await api.post(
    `${ADMIN_ENTERPRISE_BASE}/${id}/credit-periods/open`
  )
  return res.data
}

export async function getEnterpriseUsageSummary(
  id: number,
  params: {
    group_by: UsageGroupBy
    from: string
    to: string
    team_id?: number
    member_id?: number
  }
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
  /** 只看出账时计数器与明细不一致的授信账单 */
  reconcile?: 'diff'
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageData<Bill>>> {
  const res = await api.get('/api/admin/enterprise/bills', { params })
  return res.data
}

/** 标记对账差异已人工核对（幂等） */
export async function ackReconcileAlert(
  billId: number,
  note: string
): Promise<ApiResponse<Bill>> {
  const res = await api.post(
    `/api/admin/enterprise/reconcile/alerts/${billId}/ack`,
    { note }
  )
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

export async function listTrialLeads(params: {
  status?: string
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageData<TrialLead>>> {
  const res = await api.get('/api/admin/enterprise/leads', { params })
  return res.data
}

export async function updateTrialLead(
  id: number,
  payload: { status: TrialLead['status']; remark: string }
): Promise<ApiResponse<null>> {
  const res = await api.put(`/api/admin/enterprise/leads/${id}`, payload)
  return res.data
}
