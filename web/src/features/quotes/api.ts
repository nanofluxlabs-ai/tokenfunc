import { api } from '@/lib/api'

import type {
  ApiResponse,
  QuoteConfig,
  RenderQuoteRequest,
  RenderQuoteResponse,
} from './types'

const BASE = '/api/admin/enterprise/quotes'

/** reset=true 返回代码内置默认配置（不落库） */
export async function getQuoteConfig(
  reset = false
): Promise<ApiResponse<QuoteConfig>> {
  const res = await api.get(`${BASE}/config`, {
    params: reset ? { reset: 1 } : undefined,
  })
  return res.data
}

export async function updateQuoteConfig(
  config: QuoteConfig
): Promise<ApiResponse<null>> {
  const res = await api.put(`${BASE}/config`, config)
  return res.data
}

export async function renderQuote(
  payload: RenderQuoteRequest
): Promise<ApiResponse<RenderQuoteResponse>> {
  const res = await api.post(`${BASE}/render`, payload)
  return res.data
}
