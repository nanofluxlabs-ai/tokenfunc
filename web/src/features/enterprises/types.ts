export type EnterpriseBillingMode = 'prepaid' | 'credit'

export type EnterpriseStatus = 'active' | 'suspended'

export type EnterpriseCreateMode = 'new_user' | 'upgrade'

export interface EnterpriseBillingProfile {
  company_name: string
  address: string
  tax_id: string
  billing_email: string
  phone: string
  country: string
}

export interface Enterprise {
  id: number
  user_id: number
  name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  billing_mode: EnterpriseBillingMode
  credit_cycle_type: string
  credit_cycle_days: number
  credit_limit_quota: number
  /** 额度信用（quota_based）用满后是否自动开下一期 */
  credit_auto_reset: boolean
  /** 授信预警阈值（已用占额度百分比，0 关闭） */
  credit_alert_percent: number
  payment_terms_days: number
  currency: string
  billing_profile: EnterpriseBillingProfile
  status: EnterpriseStatus
  remark: string
  created_at: number
  updated_at: number
}

// 管理员企业客户列表行：企业资料 + 主账号摘要 + 授信企业的当前账期额度（预付企业为 0）
export interface EnterpriseListItem extends Enterprise {
  username: string
  display_name: string
  email: string
  quota: number
  used_quota: number
  user_status: number
  period_limit_quota: number
  period_used_quota: number
  period_start_at: number
  period_end_at: number
}

export interface EnterpriseProfilePayload {
  name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  payment_terms_days: number
  billing_profile: EnterpriseBillingProfile
  remark: string
}

export interface CreateEnterprisePayload {
  mode: EnterpriseCreateMode
  user_id?: number
  username?: string
  password?: string
  display_name?: string
  enterprise: EnterpriseProfilePayload
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface ListEnterprisesParams {
  keyword?: string
  billing_mode?: string
  p?: number
  page_size?: number
}

export type ListEnterprisesResponse = ApiResponse<{
  items: EnterpriseListItem[]
  total: number
}>

export type EnterprisesDialogType = 'create' | 'update' | 'billing'

export type CreditCycleType = 'natural_month' | 'fixed_days' | 'quota_based'

export interface CreditConfigPayload {
  cycle_type: CreditCycleType
  cycle_days: number
  limit_usd: number
  /** 预警阈值 0..99，0 关闭 */
  alert_percent: number
  /** 仅 quota_based：用满即自动开下一期；关闭则用满后拒绝请求直到账单收款 / 手动开期 */
  auto_reset: boolean
}

export interface TopupPayload {
  amount_usd: number
  reference: string
  remark: string
}

/** 营销页提交的企业试用申请 */
export interface TrialLead {
  id: number
  company: string
  contact: string
  volume: '' | 'lt_1k' | '1k_10k' | 'gt_10k'
  status: 'new' | 'contacted' | 'closed'
  remark: string
  client_ip: string
  created_at: number
  updated_at: number
}
