/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { resolveLocalizedText } from './localized-text'

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 用户协议、隐私政策、关于页等 option 允许填 `{"zh-CN": "...", "en": "..."}`
 * 形式的多语言 JSON；按当前界面语言选出一份正文，再交给 URL / HTML / Markdown 判断。
 * 不是这种 JSON（单语 Markdown、HTML、URL）时原样返回。
 */
export function resolveLocalizedDocument(
  value: string,
  language: string | undefined
): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{')) return value
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return value
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return value
  }
  // i18n 尚未初始化时 language 可能为空，退到 en 而不是抛错
  const resolved = resolveLocalizedText(
    parsed as Record<string, string>,
    language || 'en'
  )
  return resolved === '' ? value : resolved
}

export function isLikelyHtml(value: string): boolean {
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<style[\s>]|<script[\s>]|<\/?[a-z][\s\S]*>/i.test(
    value
  )
}
