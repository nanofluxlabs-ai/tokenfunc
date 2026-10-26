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
  /** 本月消耗（quota），按持有人快照汇总 */
  month_quota: number
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
  /** 周期限额（M4）：没有策略时 reset_period 为空、其余为 0 */
  reset_period: TokenQuotaResetPeriod | ''
  period_quota: number
  next_reset_at: number
  /** 派生四态（过期 > 耗尽 > 停用 > 启用），筛选与行上状态都按它；status 仍是 tokens.status 原值 */
  effective_status: number
}

export type TokenQuotaResetPeriod =
  | 'never'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom'

/** 周期限额请求体：never 删除策略；custom 时 custom_seconds 为 1 小时～366 天 */
export interface TokenQuotaPolicyPayload {
  reset_period: TokenQuotaResetPeriod
  custom_seconds: number
  period_quota: number
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
  /** 省略时不动现有周期限额 */
  quota_policy?: TokenQuotaPolicyPayload
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
  /** adjustment 流水区分对象：wallet（动余额）/ bill（只改账单） */
  ref_type: string
  reference: string
  remark: string
  operator_id: number
  created_at: number
}

export interface CreditPeriod {
  id: number
  period_no: number
  start_at: number
  /** 额度信用期没有固定截止，为 0；关闭时刻看 closed_at */
  end_at: number
  limit_quota: number
  used_quota: number
  inflight_count: number
  status: 'open' | 'closing' | 'billed'
  closed_at: number
}

/** 按天消耗（概览柱图，区间内缺的日期后端已补零） */
export interface UsageDayItem {
  day: string
  quota: number
  request_count: number
}

/** 团队本月消耗与预算进度（概览待办 / 团队角色第一张卡） */
export interface OverviewTeamBudget {
  team_id: number
  team_name: string
  month_quota: number
  budget_quota: number
  budget_percent: number
  budget_state: TeamBudgetState
  budget_enforce: boolean
}

/** 概览待办：计数为 0 / 列表为空即无待办；账单与授信预警只对企业主 / 企业管理员下发 */
export interface OverviewTodos {
  unpaid_bills: number
  overdue_bills: number
  exhausted_keys: number
  expiring_keys: number
  credit_alert_hit: boolean
  team_budget_warn: OverviewTeamBudget[]
  team_budget_exceeded: OverviewTeamBudget[]
}

export interface EnterpriseOverview {
  enterprise: EnterpriseSelf & {
    credit_cycle_type: string
    credit_cycle_days: number
    credit_limit_quota: number
    credit_auto_reset: boolean
    credit_alert_percent: number
    payment_terms_days: number
  }
  balance_quota: number
  open_period: CreditPeriod | null
  month: { quota: number; prev_quota: number }
  keys: {
    total: number
    active: number
    disabled: number
    exhausted: number
    expired: number
    expiring_7d: number
  }
  org: { teams: number; members: number; login_members: number }
  daily: UsageDayItem[]
  todos: OverviewTodos
  /** 团队角色：本团队预算（未设预算为 null）；企业视角为 null */
  team_budget: OverviewTeamBudget | null
  /** 团队角色的可见范围；企业视角为 null */
  scope: { team_id: number; team_name: string } | null
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

/** 预付月度对账单的余额变动（两种快照版本都有） */
export interface StatementBalanceSnapshot {
  opening_quota?: number
  topup_quota?: number
  consumption_quota?: number
  adjustment_quota?: number
  closing_quota?: number
}

/** 归因块：来自 ent_usage_daily；旧快照用 by_department / by_employee / by_project 键 */
export interface UsageAttributionSnapshot {
  by_team?: UsageSnapshotGroup[]
  by_member?: UsageSnapshotGroup[]
  by_department?: UsageSnapshotGroup[]
  by_employee?: UsageSnapshotGroup[]
  by_project?: UsageSnapshotGroup[]
  detail_total_quota?: number
}

/** v1 快照：只有金额级的按模型块 */
export interface BillUsageSnapshotV1
  extends StatementBalanceSnapshot, UsageAttributionSnapshot {
  snapshot_version?: undefined
  by_model?: UsageSnapshotGroup[]
}

/** v2 快照：财务中心口径，按分组-模型 / 按模型折叠（含四项 token、单价四列、倍率分布）/ 按天 */
export interface BillUsageSnapshotV2
  extends StatementBalanceSnapshot, UsageAttributionSnapshot {
  /** 旧账单按当前 logs 现算时为 live（后端不落库） */
  snapshot_source?: 'live'
  snapshot_version: number
  logs_total_calls: number
  logs_total_quota: number
  by_group_model: import('@/features/finance/types').UsageGroupModelRow[]
  by_model: import('@/features/finance/types').UsageGroupModelRow[]
  by_day: import('@/features/finance/types').UsageDailyRow[]
}

export type BillUsageSnapshot = BillUsageSnapshotV1 | BillUsageSnapshotV2

/** v2 快照才有单价与按天块；旧账单按 v1 兼容渲染，新列显示「-」 */
export function isBillSnapshotV2(
  snapshot: BillUsageSnapshot | null | undefined
): snapshot is BillUsageSnapshotV2 {
  return (snapshot?.snapshot_version ?? 0) >= 2
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
  /** 账期内 token 消耗，出账时从日聚合表冻结；prompt 为含缓存的原始输入 */
  prompt_tokens: number
  completion_tokens: number
  archive_info: BillArchiveInfo | null
  archived_at: number
  usage_snapshot: BillUsageSnapshot | null
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
