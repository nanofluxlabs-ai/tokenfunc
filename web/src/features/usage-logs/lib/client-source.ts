import type { TFunction } from 'i18next'

import type { StatusBadgeProps } from '@/components/status-badge'

/** 后端 other.client_source 的取值，见 service/log_client_source.go */
export type ClientSource =
  | 'codex'
  | 'browser'
  | 'curl'
  | 'postman'
  | 'python'
  | 'go'
  | 'okhttp'
  | 'unknown'

const SOURCE_NAMES: Record<
  Exclude<ClientSource, 'browser' | 'unknown'>,
  string
> = {
  codex: 'Codex',
  curl: 'curl',
  postman: 'Postman',
  python: 'Python',
  go: 'Go',
  okhttp: 'OkHttp',
}

const SOURCE_VARIANTS: Record<ClientSource, StatusBadgeProps['variant']> = {
  codex: 'info',
  browser: 'success',
  curl: 'neutral',
  postman: 'warning',
  python: 'info',
  go: 'info',
  okhttp: 'info',
  unknown: 'neutral',
}

const PLATFORM_NAMES: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
  chromeos: 'ChromeOS',
}

/** 来源标签：产品名保留原文，浏览器与未知走翻译 */
export function getClientSourceLabel(
  source: string | undefined,
  t: TFunction
): string {
  if (!source) return ''
  if (source === 'browser') return t('Browser')
  if (source === 'unknown') return t('Unknown')
  return SOURCE_NAMES[source as keyof typeof SOURCE_NAMES] ?? source
}

export function getClientSourceVariant(
  source: string | undefined
): StatusBadgeProps['variant'] {
  return SOURCE_VARIANTS[source as ClientSource] ?? 'neutral'
}

/** 平台标签：unknown 返回空串，调用方据此决定不渲染 */
export function getClientPlatformLabel(
  platform: string | undefined,
  t: TFunction
): string {
  if (!platform || platform === 'unknown') return ''
  return PLATFORM_NAMES[platform] ?? t(platform)
}
