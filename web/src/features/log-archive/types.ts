export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  message_key?: string
  message_params?: Record<string, unknown>
  data?: T
}

export type LogArchiveStatusValue = 'pending' | 'verified' | 'purged'

/** 一天一行的归档清单 */
export interface LogArchiveManifest {
  day: string
  status: LogArchiveStatusValue
  parts: number
  total_rows: number
  row_count: number
  min_id: number
  max_id: number
  sum_quota: number
  object_key: string
  bytes: number
  sha256: string
  schema_version: number
  last_error: string
  purged_rows: number
  purged_at: number
  created_at: number
  updated_at: number
}

export interface LogRetentionResult {
  cutoff_day: string
  days_archived: number
  days_purged: number
  rows_archived: number
  rows_deleted: number
  stopped_reason: string
  guarded_users: number
}

export interface LogRetentionStatus {
  enabled: boolean
  configured_days: number
  effective_days: number
  run_at: string
  store_configured: boolean
  bucket: string
  prefix: string
  rollup_cursor: string
  cutoff_day: string
  last_run_at: number
  last_result: LogRetentionResult
  last_error: string
  protected_types: number[]
  max_days_per_run: number
  batch_limit: number
  batch_pause_ms: number
}

export interface LogArchiveSummary {
  pending_days: number
  verified_days: number
  purged_days: number
  purged_rows: number
  max_purged_day: string
  row_mismatch_days: number
}

export interface LogArchiveStatusResponse {
  status: LogRetentionStatus
  summary: LogArchiveSummary
}

export interface PagedData<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}
