export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export type PageData<T> = { items: T[]; total: number }

export type EmployeeStatus = 'active' | 'disabled'
export type ProjectStatus = 'active' | 'archived'

export interface EnterpriseSelf {
  id: number
  user_id: number
  name: string
  billing_mode: 'prepaid' | 'credit'
  status: 'active' | 'suspended'
}

export interface Department {
  id: number
  parent_id: number
  name: string
  sort: number
}

export interface Employee {
  id: number
  department_id: number
  department_name: string
  name: string
  email: string
  employee_no: string
  status: EmployeeStatus
  remark: string
  token_count: number
  created_at: number
}

export interface EmployeePayload {
  department_id: number
  name: string
  email: string
  employee_no: string
  status: EmployeeStatus
  remark: string
}

export interface Project {
  id: number
  name: string
  code: string
  status: ProjectStatus
  remark: string
  token_count: number
  created_at: number
}

export interface ProjectPayload {
  name: string
  code: string
  status: ProjectStatus
  remark: string
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
  employee_id: number
  employee_name: string
  department_name: string
  project_id: number
  project_name: string
}

export interface TokenCreatePayload {
  name: string
  employee_id: number
  project_id: number
  remain_quota: number
  unlimited_quota: boolean
  expired_time: number
}

export interface TokenAssignmentPayload {
  employee_id: number
  project_id: number
}

// 部门树节点（前端由扁平列表构建）
export interface DepartmentNode extends Department {
  depth: number
  children: DepartmentNode[]
}

export interface EmployeeImportRow {
  name: string
  email: string
  employee_no: string
  department: string
}

export interface EmployeeImportResult {
  created: number
  created_departments: string[]
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
    payment_terms_days: number
  }
  balance_quota: number
  open_period: CreditPeriod | null
}

export type UsageGroupBy =
  | 'department'
  | 'employee'
  | 'project'
  | 'model'
  | 'token'
  | 'day'

export interface UsageSummaryItem {
  key_id: number
  key_name: string
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  quota: number
}

export interface UsageSummary {
  from: string
  to: string
  group_by: UsageGroupBy
  items: UsageSummaryItem[]
}
