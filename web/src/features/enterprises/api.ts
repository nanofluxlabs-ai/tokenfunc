import { api } from '@/lib/api'

import type {
  ApiResponse,
  CreateEnterprisePayload,
  Enterprise,
  EnterpriseProfilePayload,
  ListEnterprisesParams,
  ListEnterprisesResponse,
} from './types'

const ADMIN_ENTERPRISE_BASE = '/api/admin/enterprise/enterprises'

export async function listEnterprises(
  params: ListEnterprisesParams
): Promise<ListEnterprisesResponse> {
  const res = await api.get(ADMIN_ENTERPRISE_BASE, { params })
  return res.data
}

export async function getEnterprise(
  id: number
): Promise<ApiResponse<Enterprise>> {
  const res = await api.get(`${ADMIN_ENTERPRISE_BASE}/${id}`)
  return res.data
}

export async function createEnterprise(
  payload: CreateEnterprisePayload
): Promise<ApiResponse<Enterprise>> {
  const res = await api.post(ADMIN_ENTERPRISE_BASE, payload)
  return res.data
}

export async function updateEnterprise(
  id: number,
  payload: EnterpriseProfilePayload
): Promise<ApiResponse> {
  const res = await api.put(`${ADMIN_ENTERPRISE_BASE}/${id}`, payload)
  return res.data
}
