import { api } from '@/lib/api'

import type {
  ApiResponse,
  LogArchiveManifest,
  LogArchiveStatusResponse,
  PagedData,
} from './types'

const LOG_ARCHIVE_BASE = '/api/admin/log-archive'

export async function getLogArchiveStatus(): Promise<
  ApiResponse<LogArchiveStatusResponse>
> {
  const res = await api.get(`${LOG_ARCHIVE_BASE}/status`)
  return res.data
}

export async function listLogArchiveManifests(params: {
  p: number
  page_size: number
}): Promise<ApiResponse<PagedData<LogArchiveManifest>>> {
  const res = await api.get(`${LOG_ARCHIVE_BASE}/manifests`, { params })
  return res.data
}

export async function retryLogArchiveDay(
  day: string
): Promise<ApiResponse<LogArchiveManifest>> {
  const res = await api.post(`${LOG_ARCHIVE_BASE}/manifests/${day}/retry`)
  return res.data
}
