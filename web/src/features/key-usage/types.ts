/** GET /api/usage/token/：key 自身额度（上游接口） */
export type KeyTokenUsage = {
  name: string
  total_granted: number
  total_used: number
  total_available: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: Record<string, boolean>
  /** 秒级时间戳；0 表示永不过期 */
  expires_at: number
  /** 只有 key 勾了「允许查询账户余额」且不是企业分配的 key 才返回 */
  user_quota?: { total_available: number; total_used: number }
}

/** GET /v1/enterprise/employee/me：企业成员 key 的归属与用量；非成员 key 返回 403 */
export type KeyEmployeeInfo = {
  enterprise: { name: string; billing_mode: string }
  team: { name: string; budget_state?: 'none' | 'ok' | 'warn' | 'exceeded' }
  member: { name: string; employee_no?: string } | null
  usage: {
    today: { requests: number; quota: number }
    month: { requests: number; quota: number }
  }
  top_models: { model: string; quota: number }[]
}

/** GET /api/key-usage/logs 的单条消费记录（与用户日志同字段，只取页面要用的） */
export type KeyUsageLog = {
  id: number
  created_at: number
  model_name: string
  quota: number
  prompt_tokens: number
  completion_tokens: number
  use_time: number
  is_stream: boolean
}

export type KeyUsageLogPage = {
  items: KeyUsageLog[]
  total: number
  page: number
  page_size: number
}

export type KeyUsageLogParams = {
  page: number
  pageSize: number
  startTimestamp: number
  endTimestamp: number
  model?: string
}
