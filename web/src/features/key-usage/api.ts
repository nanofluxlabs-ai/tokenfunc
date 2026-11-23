import type {
  KeyEmployeeInfo,
  KeyTokenUsage,
  KeyUsageLogPage,
  KeyUsageLogParams,
} from './types'

/** 401 key 无效 / 停用；429 查询过于频繁；其余按网络或服务错误处理 */
export class KeyUsageError extends Error {
  constructor(
    public readonly status: number,
    message = ''
  ) {
    super(message || String(status))
    this.name = 'KeyUsageError'
  }
}

/** 粘贴时可能带着 "Bearer " 前缀或首尾空白 */
export function normalizeApiKey(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, '')
}

/**
 * 用 key 自身鉴权：不走 axios 的 api 实例，它的拦截器会用登录态覆盖 Authorization；
 * 也不带 cookie，key 只出现在请求头里，不进 URL。
 */
async function keyFetch(
  path: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<Response> {
  const response = await fetch(path, {
    credentials: 'omit',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  if (!response.ok && response.status !== 403) {
    throw new KeyUsageError(response.status)
  }
  return response
}

export async function getKeyTokenUsage(
  apiKey: string,
  signal?: AbortSignal
): Promise<KeyTokenUsage> {
  const response = await keyFetch('/api/usage/token/', apiKey, signal)
  const body = await response.json()
  if (!response.ok || !body.data) {
    throw new KeyUsageError(response.status, body.message)
  }
  return body.data as KeyTokenUsage
}

/** 非企业成员的 key 返回 403，按「没有员工信息」处理 */
export async function getKeyEmployeeInfo(
  apiKey: string,
  signal?: AbortSignal
): Promise<KeyEmployeeInfo | null> {
  const response = await keyFetch('/v1/enterprise/employee/me', apiKey, signal)
  if (response.status === 403) return null
  return (await response.json()) as KeyEmployeeInfo
}

export async function getKeyModels(
  apiKey: string,
  signal?: AbortSignal
): Promise<string[]> {
  const response = await keyFetch('/v1/models', apiKey, signal)
  if (!response.ok) return []
  const body = (await response.json()) as { data?: { id: string }[] }
  return (body.data ?? []).map((item) => item.id).sort()
}

export async function getKeyUsageLogs(
  apiKey: string,
  params: KeyUsageLogParams,
  signal?: AbortSignal
): Promise<KeyUsageLogPage> {
  const query = new URLSearchParams({
    p: String(params.page),
    page_size: String(params.pageSize),
    start_timestamp: String(params.startTimestamp),
    end_timestamp: String(params.endTimestamp),
  })
  if (params.model) query.set('model_name', params.model)
  const response = await keyFetch(
    `/api/key-usage/logs?${query.toString()}`,
    apiKey,
    signal
  )
  const body = await response.json()
  if (!response.ok || !body.success) {
    throw new KeyUsageError(response.status, body.message)
  }
  return body.data as KeyUsageLogPage
}
