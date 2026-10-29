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
// tokenfunc 二开：文档示例里的模型名从本站真实可用的模型中挑选，避免用户照抄后报「模型不存在」。
// 本文件也被构建期预渲染使用，只能相对导入。
import type { ModelFamily } from '../registry'

export const MODEL_FAMILIES: ModelFamily[] = [
  'claude',
  'gpt',
  'deepseek',
  'gemini',
  'image',
]

/** 站点模型列表拿不到时（未加载、预渲染）使用的示例名 */
export const FALLBACK_MODELS: Record<ModelFamily, string> = {
  claude: 'claude-sonnet-4-5',
  gpt: 'gpt-5',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.5-pro',
  image: 'gpt-image-1',
}

/**
 * 每个系列按偏好从前到后匹配；同一条规则命中多个时取名字排序最大的（通常是最新版本）。
 * 规则只看模型名，不依赖供应商元数据。
 */
const FAMILY_PREFERENCES: Record<ModelFamily, RegExp[]> = {
  claude: [/^claude-sonnet/, /^claude-.*sonnet/, /^claude-opus/, /^claude-/],
  gpt: [/^gpt-5(\.\d+)?$/, /^gpt-5/, /^gpt-4\.1/, /^gpt-4o/, /^gpt-/],
  deepseek: [/^deepseek-chat$/, /^deepseek-v/, /^deepseek-/],
  gemini: [/^gemini-.*pro/, /^gemini-.*flash/, /^gemini-/],
  image: [/^gpt-image/, /^dall-e/, /image/],
}

const EXCLUDED =
  /(embedding|tts|whisper|audio|realtime|transcribe|moderation|search|rerank)/

export function pickFamilyModel(
  models: string[],
  family: ModelFamily
): string | undefined {
  const candidates = models.filter((name) => !EXCLUDED.test(name.toLowerCase()))
  for (const rule of FAMILY_PREFERENCES[family]) {
    const matched = candidates
      .filter((name) => rule.test(name.toLowerCase()))
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
    if (matched.length) return matched[0]
  }
  return undefined
}

/** 为每个系列挑一个示例模型；站点没有该系列时退回固定示例名 */
export function resolveFamilyModels(
  models: string[]
): Record<ModelFamily, string> {
  return Object.fromEntries(
    MODEL_FAMILIES.map((family) => [
      family,
      pickFamilyModel(models, family) ?? FALLBACK_MODELS[family],
    ])
  ) as Record<ModelFamily, string>
}
