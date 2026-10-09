import { api } from '@/lib/api'

import type { ApiResponse, CreateQuotePayload, Quote } from './types'

const BASE = '/api/admin/enterprise/quotes'

export async function createQuote(
  payload: CreateQuotePayload
): Promise<ApiResponse<Quote>> {
  const res = await api.post(BASE, payload)
  return res.data
}

export async function listQuotes(params: {
  keyword?: string
  p?: number
  page_size?: number
}): Promise<ApiResponse<{ items: Quote[]; total: number }>> {
  const res = await api.get(BASE, { params })
  return res.data
}
