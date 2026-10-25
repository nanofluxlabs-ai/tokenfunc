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

export type PromoterCenterTab = 'daily' | 'users' | 'models'
