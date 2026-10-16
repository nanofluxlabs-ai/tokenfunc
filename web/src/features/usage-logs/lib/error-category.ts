import type { StatusBadgeProps } from '@/components/status-badge'

import type { LogOtherData } from '../types'

/**
 * 错误日志的粗粒度分类，由 other.error_type / error_code / status_code 推导：
 * - request_rejected：网关在转发前拒绝（参数、鉴权、额度、敏感词、模型不存在）
 * - upstream_failed：请求已到上游或渠道层失败（上游报错、渠道 key / 响应异常）
 * - system_error：网关自身异常（序列化、数据库、转换失败）
 */
export type ErrorCategory =
  | 'request_rejected'
  | 'upstream_failed'
  | 'system_error'

const REJECTED_ERROR_CODES = new Set([
  'invalid_request',
  'sensitive_words_detected',
  'invalid_api_type',
  'read_request_body_failed',
  'bad_request_body',
  'access_denied',
  'model_not_found',
  'prompt_blocked',
  'insufficient_user_quota',
  'pre_consume_token_quota_failed',
  'count_token_failed',
  'model_price_error',
])

const UPSTREAM_ERROR_CODES = new Set([
  'do_request_failed',
  'get_channel_failed',
  'read_response_body_failed',
  'bad_response_status_code',
  'bad_response',
  'bad_response_body',
  'empty_response',
  'aws_invoke_error',
])

const UPSTREAM_ERROR_TYPES = new Set([
  'openai_error',
  'claude_error',
  'gemini_error',
  'midjourney_error',
  'rerank_error',
  'upstream_error',
])

export const ERROR_CATEGORY_LABEL_KEYS: Record<ErrorCategory, string> = {
  request_rejected: 'Request Rejected',
  upstream_failed: 'Upstream Failed',
  system_error: 'System Error',
}

const ERROR_CATEGORY_VARIANTS: Record<
  ErrorCategory,
  StatusBadgeProps['variant']
> = {
  request_rejected: 'warning',
  upstream_failed: 'danger',
  system_error: 'danger',
}

export function resolveErrorCategory(
  other: LogOtherData | null | undefined
): ErrorCategory | null {
  if (!other) return null
  const errorType = other.error_type ?? ''
  const errorCode = other.error_code ?? ''
  const statusCode = Number(other.status_code ?? 0)

  if (UPSTREAM_ERROR_TYPES.has(errorType)) return 'upstream_failed'
  if (errorCode.startsWith('channel:')) return 'upstream_failed'
  if (errorCode.startsWith('violation_fee')) return 'request_rejected'
  if (REJECTED_ERROR_CODES.has(errorCode)) return 'request_rejected'
  if (UPSTREAM_ERROR_CODES.has(errorCode)) return 'upstream_failed'
  if (errorType === 'new_api_error' && errorCode) return 'system_error'

  // 旧日志没有 error_type / error_code，只能按状态码兜底
  if (statusCode >= 500) return 'system_error'
  if (statusCode >= 400) return 'request_rejected'
  return null
}

export function getErrorCategoryVariant(
  category: ErrorCategory
): StatusBadgeProps['variant'] {
  return ERROR_CATEGORY_VARIANTS[category]
}

/** 状态码徽章颜色：5xx 红、4xx 橙、2xx/3xx 绿 */
export function getStatusCodeVariant(
  statusCode: number
): StatusBadgeProps['variant'] {
  if (statusCode >= 500) return 'danger'
  if (statusCode >= 400) return 'warning'
  if (statusCode >= 200) return 'success'
  return 'neutral'
}
