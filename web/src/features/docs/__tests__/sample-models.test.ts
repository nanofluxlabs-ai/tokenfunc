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
import { describe, expect, it } from 'vitest'

import {
  FALLBACK_MODELS,
  pickFamilyModel,
  resolveFamilyModels,
} from '../lib/sample-models'

describe('sample models', () => {
  it('prefers the newest model of the preferred line within a family', () => {
    const models = [
      'claude-haiku-4-5',
      'claude-opus-4-8',
      'claude-sonnet-4-5',
      'claude-sonnet-5',
      'gpt-5-mini',
      'gpt-5.2',
      'gpt-5.5',
      'deepseek-flash',
      'deepseek-v4-pro',
    ]
    expect(pickFamilyModel(models, 'claude')).toBe('claude-sonnet-5')
    expect(pickFamilyModel(models, 'gpt')).toBe('gpt-5.5')
    expect(pickFamilyModel(models, 'deepseek')).toBe('deepseek-v4-pro')
  })

  it('picks the newest GPT generation first, then prefers Sol over other tiers', () => {
    expect(
      pickFamilyModel(
        [
          'gpt-5.6-sol',
          'gpt-6-luna',
          'gpt-6.1-terra',
          'gpt-6.1-sol',
          'gpt-6-astra',
        ],
        'gpt'
      )
    ).toBe('gpt-6.1-sol')
    // 生产当前只有 gpt-6-luna 与 gpt-5.6-terra：选最新一代的 Luna，而不是旧一代的 Terra
    expect(
      pickFamilyModel(['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-6-luna'], 'gpt')
    ).toBe('gpt-6-luna')
    // mini / codex / pro 等变体不作示例
    expect(
      pickFamilyModel(['gpt-6.1-mini', 'gpt-6-codex', 'gpt-5.5'], 'gpt')
    ).toBe('gpt-5.5')
  })

  it('prefers the newest Claude Sonnet', () => {
    expect(
      pickFamilyModel(
        [
          'claude-opus-5-5',
          'claude-sonnet-5',
          'claude-sonnet-5-5',
          'claude-haiku-5-5',
        ],
        'claude'
      )
    ).toBe('claude-sonnet-5-5')
  })

  it('skips embedding, audio and other non-chat models', () => {
    expect(
      pickFamilyModel(['gpt-4o-transcribe', 'gpt-4o-mini-tts', 'gpt-4o'], 'gpt')
    ).toBe('gpt-4o')
    expect(pickFamilyModel(['text-embedding-3-small'], 'gpt')).toBeUndefined()
  })

  it('falls back to the fixed sample name when the site has no model of a family', () => {
    const resolved = resolveFamilyModels(['glm-5.3'])
    expect(resolved).toEqual(FALLBACK_MODELS)
  })
})
