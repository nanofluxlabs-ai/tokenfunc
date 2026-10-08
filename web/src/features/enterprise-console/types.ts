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
