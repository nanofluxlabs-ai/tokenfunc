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
  payment_terms_days: number
  currency: string
  billing_profile: EnterpriseBillingProfile
  status: EnterpriseStatus
  remark: string
  created_at: number
  updated_at: number
}

// 管理员企业客户列表行：企业资料 + 主账号摘要
export interface EnterpriseListItem extends Enterprise {
  username: string
  display_name: string
  email: string
  quota: number
  used_quota: number
  user_status: number
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

export type EnterprisesDialogType = 'create' | 'update'
