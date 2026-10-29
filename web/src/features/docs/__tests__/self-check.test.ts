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
  SELF_CHECK_TOOLS,
  buildProbeRequest,
  checkAddress,
  classifyFailure,
  readErrorMessage,
  toolForGuide,
} from '../lib/self-check'
import { DOCS_PAGES } from '../registry'

const BASE = 'https://api.example.com'

describe('checkAddress', () => {
  it.each([
    ['https://api.example.com', 'root', 'ok'],
    ['https://api.example.com/', 'root', 'ok'],
    ['https://api.example.com/v1', 'v1', 'ok'],
    ['https://api.example.com/v1/', 'v1', 'ok'],
    ['https://api.example.com/v1', 'root', 'extra-v1'],
    ['https://api.example.com', 'v1', 'missing-v1'],
    ['https://api.example.com/v1/chat/completions', 'v1', 'full-path'],
    ['https://api.example.com/v1/messages', 'root', 'full-path'],
    ['https://api.example.com/api', 'v1', 'unexpected-path'],
    ['http://api.example.com/v1', 'v1', 'scheme'],
    ['https://api.openai.com/v1', 'v1', 'other-host'],
    ['api.example.com/v1', 'v1', 'invalid'],
    ['   ', 'v1', 'empty'],
  ] as const)('%s for a %s tool is %s', (entered, style, expected) => {
    expect(checkAddress(entered, BASE, style)).toBe(expected)
  })
})

describe('classifyFailure', () => {
  it('maps gateway errors to the advice the user needs', () => {
    expect(classifyFailure(401, { error: { message: '无效的令牌' } })).toBe(
      'invalid-key'
    )
    expect(
      classifyFailure(403, {
        error: { code: 'insufficient_user_quota', message: 'x' },
      })
    ).toBe('insufficient-quota')
    expect(
      classifyFailure(403, { error: { message: '用户额度不足, 剩余额度: 0' } })
    ).toBe('insufficient-quota')
    expect(
      classifyFailure(403, { error: { message: '该令牌无权访问模型 x' } })
    ).toBe('forbidden')
    expect(classifyFailure(503, { error: { code: 'model_not_found' } })).toBe(
      'no-channel'
    )
    expect(
      classifyFailure(400, { type: 'error', error: { message: 'bad' } })
    ).toBe('bad-request')
    expect(classifyFailure(429, {})).toBe('rate-limited')
    expect(classifyFailure(502, 'upstream')).toBe('server-error')
  })

  it('reads messages from OpenAI and Anthropic error bodies', () => {
    expect(readErrorMessage({ error: { message: 'openai' } })).toBe('openai')
    expect(
      readErrorMessage({ type: 'error', error: { message: 'anthropic' } })
    ).toBe('anthropic')
    expect(readErrorMessage('plain text')).toBe('')
  })
})

describe('buildProbeRequest', () => {
  it('uses the protocol of the tool with a minimal output budget', () => {
    const anthropic = buildProbeRequest(
      `${BASE}/`,
      'anthropic',
      'sk-1',
      'claude-x'
    )
    expect(anthropic.url).toBe(`${BASE}/v1/messages`)
    expect(anthropic.init.headers).toMatchObject({ 'x-api-key': 'sk-1' })
    expect(JSON.parse(String(anthropic.init.body))).toMatchObject({
      max_tokens: 1,
    })

    const responses = buildProbeRequest(
      BASE,
      'openai-responses',
      'sk-1',
      'gpt-x'
    )
    expect(responses.url).toBe(`${BASE}/v1/responses`)
    expect(JSON.parse(String(responses.init.body))).toMatchObject({
      max_output_tokens: 16,
    })

    const chat = buildProbeRequest(BASE, 'openai-chat', 'sk-1', 'gpt-x')
    expect(chat.url).toBe(`${BASE}/v1/chat/completions`)
    expect(chat.init.headers).toMatchObject({ Authorization: 'Bearer sk-1' })
  })
})

describe('self-check tools', () => {
  it('links every tool to an existing guide and covers every tool guide', () => {
    const slugs = DOCS_PAGES.map((page) => page.slug)
    for (const tool of SELF_CHECK_TOOLS) expect(slugs).toContain(tool.guide)

    const toolGuides = DOCS_PAGES.filter(
      (page) => page.group === 'tools' && page.slug !== 'tools-overview'
    )
    for (const page of toolGuides) {
      expect(toolForGuide(page.slug), page.slug).toBeDefined()
    }
  })
})
