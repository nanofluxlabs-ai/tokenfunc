export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export type PageData<T> = { items: T[]; total: number }

export type TeamStatus = 'active' | 'archived'
export type MemberStatus = 'active' | 'disabled'
/** 成员角色：none = 不登录只持 key */
export type MemberRole =
  | 'none'
  | 'developer'
  | 'team_admin'
  | 'enterprise_admin'

/** 当前登录者在企业里的身份（企业主或已绑定登录的成员） */
export interface EnterpriseActor {
  member_id: number
  role: MemberRole
  team_id: number
  is_owner: boolean
  provisioned: boolean
}

export interface EnterpriseSelf {
  id: number
  user_id: number
  name: string
  billing_mode: 'prepaid' | 'credit'
  status: 'active' | 'suspended'
  actor: EnterpriseActor
}

export interface Team {
  id: number
  name: string
  sort: number
  is_default: boolean
  status: TeamStatus
  monthly_budget_quota: number
  budget_alert_percent: number
  budget_enforce: boolean
  created_at: number
  member_count: number
  token_count: number
  /** 本月消耗（quota）与预算占比；budget_state 为 none 表示未设预算 */
  month_quota: number
  budget_percent: number
  budget_state: TeamBudgetState
}

export type TeamBudgetState = 'none' | 'ok' | 'warn' | 'exceeded'

export interface TeamPayload {
  name: string
  sort: number
  monthly_budget_usd?: number
  budget_alert_percent?: number
  budget_enforce?: boolean
}

export interface Member {
  id: number
  team_id: number
  team_name: string
  name: string
  email: string
  employee_no: string
  user_id: number
  username: string
  role: MemberRole
  provisioned: boolean
  status: MemberStatus
  remark: string
  token_count: number
  created_at: number
}

export interface MemberPayload {
  team_id: number
  name: string
  email: string
  employee_no: string
  status: MemberStatus
  remark: string
}

export interface MemberLoginPayload {
  mode: 'bind' | 'provision'
  identifier?: string
  role?: MemberRole
}

/** 一键开通返回的凭据（初始密码只出现这一次） */
export interface ProvisionedLogin {
  user_id: number
  username: string
  password?: string
}

export interface EnterpriseToken {
  id: number
  name: string
  key: string
  status: number
  remain_quota: number
  unlimited_quota: boolean
  used_quota: number
  expired_time: number
  created_time: number
  accessed_time: number
  group: string
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  team_id: number
  team_name: string
  team_status: TeamStatus | ''
  member_id: number
  member_name: string
  /** 本月 / 上月消耗（quota），从 ent_usage_daily 回填 */
  month_quota: number
  prev_month_quota: number
}

/** 新建 / 编辑共用的请求体 */
export interface TokenMutatePayload {
  name: string
  team_id: number
  member_id: number
  remain_quota: number
  unlimited_quota: boolean
  expired_time: number
  group: string
  model_limits: string[]
  allow_ips: string
}

export interface TokenOptions {
  owner_group: string
  groups: { value: string; desc: string; ratio: number }[]
  /** 各分组启用的模型；空字符串键 = 不选分组时（按主账号分组路由） */
  models_by_group: Record<string, string[]>
  limit: number
  total: number
}

export interface TokenBatchResult {
  updated: number
  skipped: number[]
}

export interface TokenAssignmentPayload {
  team_id: number
  member_id: number
}

export interface MemberImportRow {
  name: string
  email: string
  employee_no: string
  team: string
}

export interface MemberImportResult {
  created: number
  created_teams: string[]
  errors: { row: number; message: string }[]
}

export interface LedgerEntry {
  id: number
  type: string
  amount_quota: number
  balance_after_quota: number
  reference: string
  remark: string
  operator_id: number
  created_at: number
}

export interface CreditPeriod {
  id: number
  period_no: number
  start_at: number
  end_at: number
  limit_quota: number
  used_quota: number
  inflight_count: number
  status: 'open' | 'closing' | 'billed'
}

export interface EnterpriseOverview {
  enterprise: EnterpriseSelf & {
    credit_cycle_type: string
    credit_cycle_days: number
    credit_limit_quota: number
    credit_alert_percent: number
    payment_terms_days: number
  }
  balance_quota: number
  open_period: CreditPeriod | null
}

export type UsageGroupBy = 'team' | 'member' | 'model' | 'token' | 'day'

export interface UsageSummaryItem {
  key_id: number
  key_name: string
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  cache_tokens: number
  cache_creation_tokens: number
  quota: number
}

export interface UsageSummary {
  from: string
  to: string
  group_by: UsageGroupBy
  items: UsageSummaryItem[]
}

export type BillStatus = 'unpaid' | 'partially_paid' | 'paid' | 'void'
export type BillType = 'credit' | 'statement'

export interface UsageSnapshotGroup {
  key_id: number
  key_name: string
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  cache_tokens?: number
  cache_creation_tokens?: number
  quota: number
}

/** 账期包里单个对象的登记 */
export interface BillArchiveObject {
  key: string
  bytes: number
  sha256: string
  rows: number
}

/** ent_bills.archive_info：账期包归档登记 */
export interface BillArchiveInfo {
  statement?: BillArchiveObject
  raw_logs?: BillArchiveObject
  schema_version: number
  archived_at: number
}

export interface Bill {
  id: number
  bill_no: string
  enterprise_id: number
  period_id: number
  bill_type: BillType
  period_start: number
  period_end: number
  amount_quota: number
  amount_usd: string
  adjustment_usd: string
  total_usd: string
  paid_usd: string
  currency: string
  status: BillStatus
  issued_at: number
  due_at: number
  paid_at: number
  reminder_count: number
  /** 出账时计数器 − 明细聚合的差额（quota），0 表示一致 */
  reconcile_diff_quota: number
  /** 管理员标记差异已核对的时间 / 操作人 / 备注；未核对时为 0 / 0 / '' */
  reconcile_acked_at: number
  reconcile_acked_by: number
  reconcile_ack_note: string
  archive_info: BillArchiveInfo | null
  archived_at: number
  usage_snapshot: Record<string, unknown> | null
  seller_snapshot: SellerProfile | null
  buyer_snapshot: {
    enterprise_name?: string
    contact_name?: string
    contact_email?: string
    billing_profile?: {
      company_name?: string
      address?: string
      tax_id?: string
      billing_email?: string
      phone?: string
      country?: string
    }
  } | null
  remark: string
}

export interface SellerProfile {
  company_name: string
  address: string
  tax_id: string
  email: string
  phone: string
  bank_name: string
  bank_account_name: string
  bank_account_no: string
  swift_code: string
  payment_notes: string
  footer_notes: string
  logo_url: string
}
