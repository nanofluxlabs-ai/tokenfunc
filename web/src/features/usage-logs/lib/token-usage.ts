import type { LogOtherData } from '../types'

/** 日志 token 展示口径（TokenFunc 二开）：输入一律显示未命中缓存的部分 */
export interface TokenUsageDisplay {
  /** 未命中缓存的输入 token */
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/**
 * 日志里的 prompt_tokens 是否已经不含缓存。与后端结算（service/text_quota.go）
 * 和日志页统计 SQL（model/tokenfunc_log_stat.go 的 is_net）同一套规则：
 * Anthropic 语义，或旧版由 Claude 用量换算来的行（带 5m / 1h 缓存写入拆分，
 * 或只带 cache_creation_tokens 而没有 OpenAI 专有的 12h 写入）。
 * 其余（OpenAI 语义）的 prompt_tokens 含缓存读写，展示时要减掉。
 */
export function promptTokensExcludeCache(
  other: LogOtherData | null | undefined
): boolean {
  if (!other) return false
  if (other.usage_semantic === 'anthropic') return true
  if (
    (other.cache_creation_tokens_5m || 0) > 0 ||
    (other.cache_creation_tokens_1h || 0) > 0
  ) {
    return true
  }
  return (
    other.cache_creation_tokens != null &&
    other.cache_creation_tokens_12h == null
  )
}

/** 缓存写入总量：有 5m / 1h 拆分时取两者之和，否则取 cache_creation_tokens */
export function cacheWriteTokensOf(
  other: LogOtherData | null | undefined
): number {
  if (!other) return 0
  const split =
    (other.cache_creation_tokens_5m || 0) + (other.cache_creation_tokens_1h || 0)
  if (split > 0) return split
  return other.cache_creation_tokens || 0
}

export function resolveTokenUsage(
  log: { prompt_tokens: number; completion_tokens: number },
  other: LogOtherData | null | undefined
): TokenUsageDisplay {
  const promptTokens = log.prompt_tokens || 0
  const cacheReadTokens = other?.cache_tokens || 0
  const cacheWriteTokens = cacheWriteTokensOf(other)
  const inputTokens = promptTokensExcludeCache(other)
    ? promptTokens
    : Math.max(promptTokens - cacheReadTokens - cacheWriteTokens, 0)
  return {
    inputTokens,
    outputTokens: log.completion_tokens || 0,
    cacheReadTokens,
    cacheWriteTokens,
  }
}
