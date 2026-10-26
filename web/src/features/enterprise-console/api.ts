import type { FinanceBillContext } from '@/features/finance/types'
import { api } from '@/lib/api'

import type {
  ApiResponse,
  Bill,
  CreditPeriod,
  EnterpriseOverview,
  EnterpriseSelf,
  EnterpriseToken,
  LedgerEntry,
  Member,
  MemberImportResult,
  MemberImportRow,
  MemberLoginPayload,
  MemberPayload,
  MemberRole,
  PageData,
  ProvisionedLogin,
  Team,
  TeamPayload,
  TokenAssignmentPayload,
  TokenBatchResult,
  TokenMutatePayload,
  TokenOptions,
  TokenQuotaPolicyPayload,
  UsageGroupBy,
  UsageSummary,
} from './types'

const BASE = '/api/enterprise'

export async function getEnterpriseSelf(): Promise<
  ApiResponse<EnterpriseSelf | null>
> {
  const res = await api.get(`${BASE}/self`)
  return res.data
}

// ---------------------------------------------------------------------------
// 团队
// ---------------------------------------------------------------------------

export async function listTeams(): Promise<ApiResponse<Team[]>> {
  const res = await api.get(`${BASE}/teams`)
  return res.data
}

export async function createTeam(
  payload: TeamPayload
): Promise<ApiResponse<Team>> {
  const res = await api.post(`${BASE}/teams`, payload)
  return res.data
}

export async function updateTeam(
  id: number,
  payload: TeamPayload
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/teams/${id}`, payload)
  return res.data
}

export async function archiveTeam(id: number): Promise<ApiResponse> {
  const res = await api.post(`${BASE}/teams/${id}/archive`)
  return res.data
}

export async function deleteTeam(id: number): Promise<ApiResponse> {
  const res = await api.delete(`${BASE}/teams/${id}`)
  return res.data
}

// ---------------------------------------------------------------------------
// 成员
// ---------------------------------------------------------------------------

export async function listMembers(params: {
  team_id?: number
  member_id?: number
  keyword?: string
  status?: string
  has_login?: boolean
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageData<Member>>> {
  const res = await api.get(`${BASE}/members`, { params })
  return res.data
}

export async function createMember(
  payload: MemberPayload
): Promise<ApiResponse<Member>> {
  const res = await api.post(`${BASE}/members`, payload)
  return res.data
}

export async function importMembers(
  rows: MemberImportRow[]
): Promise<ApiResponse<MemberImportResult>> {
  const res = await api.post(`${BASE}/members/import`, { rows })
  return res.data
}

export async function updateMember(
  id: number,
  payload: MemberPayload
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/members/${id}`, payload)
  return res.data
}

export async function deleteMember(id: number): Promise<ApiResponse> {
  const res = await api.delete(`${BASE}/members/${id}`)
  return res.data
}

/** 给成员开通控制台登录：绑定已有账号或一键开通新账号 */
export async function setMemberLogin(
  id: number,
  payload: MemberLoginPayload
): Promise<ApiResponse<ProvisionedLogin>> {
  const res = await api.post(`${BASE}/members/${id}/login`, payload)
  return res.data
}

export async function removeMemberLogin(id: number): Promise<ApiResponse> {
  const res = await api.delete(`${BASE}/members/${id}/login`)
  return res.data
}

export async function setMemberRole(
  id: number,
  role: MemberRole
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/members/${id}/role`, { role })
  return res.data
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

export async function listEnterpriseTokens(params: {
  team_id?: number
  member_id?: number
  status?: number
  expiring?: boolean
  keyword?: string
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageData<EnterpriseToken>>> {
  const res = await api.get(`${BASE}/tokens`, { params })
  return res.data
}

/** 新建 / 编辑抽屉的可选项：分组、各分组模型、key 上限与当前总数 */
export async function getEnterpriseTokenOptions(): Promise<
  ApiResponse<TokenOptions>
> {
  const res = await api.get(`${BASE}/tokens/options`)
  return res.data
}

export async function createEnterpriseToken(
  payload: TokenMutatePayload
): Promise<ApiResponse<{ id: number }>> {
  const res = await api.post(`${BASE}/tokens`, payload)
  return res.data
}

export async function updateEnterpriseToken(
  id: number,
  payload: TokenMutatePayload
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/tokens/${id}`, payload)
  return res.data
}

export async function updateEnterpriseTokenStatus(
  id: number,
  status: number
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/tokens/${id}/status`, { status })
  return res.data
}

export async function deleteEnterpriseToken(id: number): Promise<ApiResponse> {
  const res = await api.delete(`${BASE}/tokens/${id}`)
  return res.data
}

export async function batchUpdateEnterpriseTokenStatus(
  ids: number[],
  status: number
): Promise<ApiResponse<TokenBatchResult>> {
  const res = await api.post(`${BASE}/tokens/batch-status`, { ids, status })
  return res.data
}

export async function batchDeleteEnterpriseTokens(
  ids: number[]
): Promise<ApiResponse<{ deleted: number }>> {
  const res = await api.post(`${BASE}/tokens/batch-delete`, { ids })
  return res.data
}

export async function updateTokenAssignment(
  id: number,
  payload: TokenAssignmentPayload
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/tokens/${id}/assignment`, payload)
  return res.data
}

/** 周期限额：写入即施行（剩余额度立刻等于周期额度）；reset_period=never 删除策略 */
export async function setTokenQuotaPolicy(
  id: number,
  payload: TokenQuotaPolicyPayload
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/tokens/${id}/quota-policy`, payload)
  return res.data
}

/** 批量周期限额（≤ 200，全成功或全失败） */
export async function batchSetTokenQuotaPolicy(
  tokenIds: number[],
  payload: TokenQuotaPolicyPayload
): Promise<ApiResponse<{ updated: number }>> {
  const res = await api.post(`${BASE}/tokens/batch-quota-policy`, {
    token_ids: tokenIds,
    ...payload,
  })
  return res.data
}

/** 企业 key 的明文（上游 /api/token/:id/key 按登录者查，成员账号拿不到主账号的 key） */
export async function fetchEnterpriseTokenKey(
  id: number
): Promise<ApiResponse<{ key: string }>> {
  const res = await api.post(`${BASE}/tokens/${id}/key`)
  return res.data
}

// ---------------------------------------------------------------------------
// 概览 / 财务 / 用量
// ---------------------------------------------------------------------------

export async function getEnterpriseOverview(): Promise<
  ApiResponse<EnterpriseOverview>
> {
  const res = await api.get(`${BASE}/overview`)
  return res.data
}

export async function listLedger(params: {
  p?: number
  page_size?: number
  ts_start?: number
  ts_end?: number
  /** 账本类型，逗号分隔多个；不传为全部 */
  type?: string
}): Promise<ApiResponse<PageData<LedgerEntry>>> {
  const res = await api.get(`${BASE}/ledger`, { params })
  return res.data
}

export async function listCreditPeriods(params: {
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageData<CreditPeriod>>> {
  const res = await api.get(`${BASE}/credit-periods`, { params })
  return res.data
}

export type UsageQuery = {
  group_by: UsageGroupBy
  from: string
  to: string
  team_id?: number
  member_id?: number
}

export async function getUsageSummary(
  params: UsageQuery
): Promise<ApiResponse<UsageSummary>> {
  const res = await api.get(`${BASE}/usage/summary`, { params })
  return res.data
}

/** 下载用量 CSV（服务端生成，带 BOM） */
export async function downloadUsageCsv(
  url: string,
  params: { from: string; to: string; team_id?: number; member_id?: number }
): Promise<Blob> {
  const res = await api.get(url, { params, responseType: 'blob' })
  return res.data as Blob
}

export const USAGE_EXPORT_URL = `${BASE}/usage/export`

export async function listBills(params: {
  status?: string
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageData<Bill>>> {
  const res = await api.get(`${BASE}/bills`, { params })
  return res.data
}

export async function getBill(
  id: number
): Promise<ApiResponse<FinanceBillContext>> {
  const res = await api.get(`${BASE}/bills/${id}`)
  return res.data
}

/** 账单 CSV 的主体：企业控制台看自己的账单，管理员财务中心走 admin 路由 */
export type BillExportScope = 'enterprise' | 'admin'

/** 下载账单 CSV（已归档透传冻结件，否则由快照还原）；业务失败时返回 JSON blob，调用方按 content-type 区分 */
export async function downloadBillCsv(
  id: number,
  scope: BillExportScope
): Promise<Blob> {
  const base = scope === 'admin' ? '/api/admin/enterprise' : BASE
  const res = await api.get(`${base}/bills/${id}/export`, {
    responseType: 'blob',
  })
  return res.data as Blob
}
