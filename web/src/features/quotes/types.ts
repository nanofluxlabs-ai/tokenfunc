/** 与后端 setting/quote_setting 的结构一一对应（snake_case JSON） */

export type QuoteRenderType = 'cache_table' | 'simple_table'
export type QuoteFooterNote =
  | ''
  | 'official_notes'
  | 'proxy_comparison'
  | 'gpt_notes'
export type QuoteSubgroup = 'standard' | 'codex'

export type QuoteGroup = {
  key: string
  name: string
  short_name: string
  order: number
  default_discount: number
  render_type: QuoteRenderType
  intro: string
  model_table_title: string
  tail_header: string
  tail_cell: string
  appendix_title: string
  show_unit_line: boolean
  show_stability_warning: boolean
  footer_note: QuoteFooterNote
  show_image_pricing: boolean
  thinking_alias: boolean
}

export type QuoteModel = {
  name: string
  id: string
  group_key: string
  subgroup: QuoteSubgroup
  context_window: string
  max_output: string
  input_price: number
  cache_write_5m: number
  cache_write_1h: number
  cache_read: number
  output_price: number
  note: string
}

export type CapRow = { cells: string[] }

export type CapabilityTables = {
  source_note: string
  platform_throughput: CapRow[]
  per_user_scenario: CapRow[]
  rate_commitment_note: string
  rate_commitment: CapRow[]
}

export type CapabilityTableField =
  | 'platform_throughput'
  | 'per_user_scenario'
  | 'rate_commitment'

export type QuoteMeta = {
  brand_name: string
  doc_title: string
  header_intro: string
  domain: string
  api_key_env_name: string
  contact_text: string
  sample_claude_model_id: string
  sample_gpt_model_id: string
  exchange_rate_note: string
  default_exchange_rate: number
  default_validity_days: number
}

export type ImageTokenItem = { label: string; key: string; price: number }
export type ImagePerImageItem = { quality: string; price: number }

export type ImagePricingBlock = {
  group_key: string
  model_id: string
  section_title: string
  token_items: ImageTokenItem[]
  per_image_items: ImagePerImageItem[]
  note: string
}

export type QuoteConfig = {
  groups: QuoteGroup[]
  models: QuoteModel[]
  capability: CapabilityTables
  meta: QuoteMeta
  image_pricing: ImagePricingBlock[]
}

export type RenderQuoteRequest = {
  discounts: Record<string, number>
  exchange_rate: number
  validity_days: number
  generated_date: string
}

export type RenderQuoteResponse = {
  markdown: string
  generated_date: string
  expiry_date: string
}

export type ApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}

/** 配置子编辑器共用的 props：整份配置 + 整体保存回调 */
export type QuoteConfigEditorProps = {
  config: QuoteConfig
  onSave: (next: QuoteConfig) => Promise<boolean>
  saving: boolean
}
