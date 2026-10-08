import { api } from '@/lib/api'

import type {
  ApiResponse,
  Department,
  Employee,
  EmployeePayload,
  EnterpriseSelf,
  EnterpriseToken,
  PageData,
  Project,
  ProjectPayload,
  TokenAssignmentPayload,
  TokenCreatePayload,
} from './types'

const BASE = '/api/enterprise'

export async function getEnterpriseSelf(): Promise<
  ApiResponse<EnterpriseSelf | null>
> {
  const res = await api.get(`${BASE}/self`)
  return res.data
}

export async function listDepartments(): Promise<ApiResponse<Department[]>> {
  const res = await api.get(`${BASE}/departments`)
  return res.data
}

export async function createDepartment(
  payload: Pick<Department, 'name' | 'parent_id' | 'sort'>
): Promise<ApiResponse<Department>> {
  const res = await api.post(`${BASE}/departments`, payload)
  return res.data
}

export async function updateDepartment(
  id: number,
  payload: Pick<Department, 'name' | 'parent_id' | 'sort'>
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/departments/${id}`, payload)
  return res.data
}

export async function deleteDepartment(id: number): Promise<ApiResponse> {
  const res = await api.delete(`${BASE}/departments/${id}`)
  return res.data
}

export async function listEmployees(params: {
  department_id?: number
  keyword?: string
  status?: string
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageData<Employee>>> {
  const res = await api.get(`${BASE}/employees`, { params })
  return res.data
}

export async function createEmployee(
  payload: EmployeePayload
): Promise<ApiResponse<Employee>> {
  const res = await api.post(`${BASE}/employees`, payload)
  return res.data
}

export async function updateEmployee(
  id: number,
  payload: EmployeePayload
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/employees/${id}`, payload)
  return res.data
}

export async function deleteEmployee(id: number): Promise<ApiResponse> {
  const res = await api.delete(`${BASE}/employees/${id}`)
  return res.data
}

export async function listProjects(params: {
  keyword?: string
  status?: string
}): Promise<ApiResponse<Project[]>> {
  const res = await api.get(`${BASE}/projects`, { params })
  return res.data
}

export async function createProject(
  payload: ProjectPayload
): Promise<ApiResponse<Project>> {
  const res = await api.post(`${BASE}/projects`, payload)
  return res.data
}

export async function updateProject(
  id: number,
  payload: ProjectPayload
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/projects/${id}`, payload)
  return res.data
}

export async function deleteProject(id: number): Promise<ApiResponse> {
  const res = await api.delete(`${BASE}/projects/${id}`)
  return res.data
}

export async function listEnterpriseTokens(params: {
  employee_id?: number
  project_id?: number
  keyword?: string
  p?: number
  page_size?: number
}): Promise<ApiResponse<PageData<EnterpriseToken>>> {
  const res = await api.get(`${BASE}/tokens`, { params })
  return res.data
}

export async function createEnterpriseToken(
  payload: TokenCreatePayload
): Promise<ApiResponse<{ id: number }>> {
  const res = await api.post(`${BASE}/tokens`, payload)
  return res.data
}

export async function updateTokenAssignment(
  id: number,
  payload: TokenAssignmentPayload
): Promise<ApiResponse> {
  const res = await api.put(`${BASE}/tokens/${id}/assignment`, payload)
  return res.data
}
