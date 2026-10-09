import type { SellerProfile } from '@/features/enterprise-console/types'

export interface QuoteItem {
  model_name: string
  vendor_name: string
  group: string
  input_usd: number
  output_usd: number
  cache_usd: number
  discount_percent: number
  quoted_input_usd: number
  quoted_output_usd: number
  quoted_cache_usd: number
  note: string
}

export interface QuoteItemInput {
  model_name: string
  vendor_name: string
  group: string
  input_usd: number
  output_usd: number
  cache_usd: number
  /** 0 表示使用全局折扣 */
  discount_percent: number
  note: string
}

export interface Quote {
  id: number
  quote_no: string
  customer_name: string
  customer_contact: string
  customer_email: string
  currency: string
  discount_percent: number
  valid_until: number
  notes: string
  items: QuoteItem[]
  seller_snapshot: SellerProfile | null
  created_by: number
  created_at: number
}

export interface CreateQuotePayload {
  customer_name: string
  customer_contact: string
  customer_email: string
  discount_percent: number
  valid_until: number
  notes: string
  items: QuoteItemInput[]
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}
