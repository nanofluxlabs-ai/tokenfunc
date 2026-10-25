export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  message_key?: string
  message_params?: Record<string, unknown>
  data?: T
}

/** 推广人档案（aff_code 用于拼推广链接） */
export interface PromoterProfile {
  id: number
  user_id: number
  username: string
  display_name: string
  aff_code: string
  remark: string
  /** 分成比例（百分比，0 = 未设置），只做标识 */
  share_rate: number
  created_at: number
}

export interface PromoterCenterSummary {
  bound_user_count: number
  active_user_count: number
  consume_quota: number
  refund_quota: number
  net_quota: number
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface PromoterCenterDaily {
  day: string
  net_quota: number
  request_count: number
  prompt_tokens: number
  completion_tokens: number
}

export interface PromoterCenterRange {
  start: number
  end_excl: number
  start_day: string
  end_day: string
}

export interface PromoterCenterOverview {
  promoter: PromoterProfile
  range: PromoterCenterRange
  summary: PromoterCenterSummary
  daily: PromoterCenterDaily[]
}

export type PromoterBindingSource = 'register' | 'admin'

/** 名下用户一行；email / group / bound_by_username 只在管理员视图下发 */
export interface PromoterCenterUser {
  user_id: number
  username: string
  display_name: string
  is_enterprise: boolean
  deleted: boolean
  source: PromoterBindingSource
  bound_at: number
  usage_since: number
  net_quota: number
  request_count: number
  total_tokens: number
  last_consume_day: string
  email?: string
  group?: string
  bound_by_username?: string
}

export interface PromoterCenterModel {
  model_name: string
  net_quota: number
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  percentage: number
}

export interface PromoterCenterModels {
  summary: PromoterCenterSummary
  items: PromoterCenterModel[]
}

export interface PromoterCenterUserUsage {
  user: PromoterCenterUser
  summary: PromoterCenterSummary
  daily: PromoterCenterDaily[]
  models: PromoterCenterModel[]
}

/** 自助视图走 /api/promoter/center，管理员视角走 /api/admin/promoter/promoters/:id/center */
export type PromoterScope =
  | { scope: 'self' }
  | { scope: 'admin'; promoterId: number }

/** YYYY-MM-DD 闭区间；缺省时后端取本月 1 日 → 今天 */
export type PromoterRangeParams = { start: string; end: string } | undefined

export type PromoterCenterTab = 'daily' | 'users' | 'models' | 'settlements'

/** 已落库的结算记录；reference / settled_by 只在管理员视图下发 */
export interface PromoterSettlementRecord {
  id: number
  /** 实付金额（USD 字符串）；未填为 null */
  amount_usd: string | null
  remark: string
  settled_at: number
  reference?: string
  settled_by?: number
  settled_by_username?: string
}

/** 某月某个绑定用户的消耗；has_credit 为 false 时两个授信桶无意义 */
export interface PromoterSettlementUser {
  user_id: number
  username: string
  display_name: string
  deleted: boolean
  is_enterprise: boolean
  net_quota: number
  has_credit: boolean
  credit_paid_quota: number
  credit_unpaid_quota: number
}

/** 一个自然月：整月口径的净消耗、授信拆分、结算状态与按用户子行 */
export interface PromoterSettlementMonth {
  month: string
  settleable: boolean
  net_quota: number
  credit_paid_quota: number
  credit_unpaid_quota: number
  /** 仅管理员：待回款中已核销账单的部分 */
  credit_void_quota?: number
  settled: boolean
  settlement?: PromoterSettlementRecord
  users: PromoterSettlementUser[]
}

/** 结算列表参数：按区间列月份，或 all=true 列推广人创建月至今 */
export type PromoterSettlementParams =
  | { start: string; end: string }
  | { all: true }
