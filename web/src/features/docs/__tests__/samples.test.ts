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
  buildChatCompletionsSample,
  buildClaudeCodeSettingsSample,
  buildClaudeCodeShellSample,
  buildCodexTomlSample,
  buildHermesEnvSample,
  buildImageEditsSample,
  buildImageGenerationsSample,
  buildMessagesSample,
  buildModelsSample,
  buildOpenClawProviderSample,
  buildPiModelsSample,
  buildResponsesSample,
  SAMPLE_LANGS,
  SAMPLE_MODELS,
  type SampleLang,
} from '../lib/samples'

const BASE = 'https://gw.example.com'
const CTX = { baseUrl: BASE }

const ALL_BUILDERS: Record<
  string,
  (lang: SampleLang, ctx: { baseUrl: string }) => string
> = {
  models: buildModelsSample,
  chat: buildChatCompletionsSample,
  messages: buildMessagesSample,
  responses: buildResponsesSample,
  images: buildImageGenerationsSample,
  edits: buildImageEditsSample,
}

describe('docs code samples', () => {
  it('produces non-empty samples for every endpoint and language', () => {
    for (const [name, build] of Object.entries(ALL_BUILDERS)) {
      for (const lang of SAMPLE_LANGS) {
        const sample = build(lang, CTX)
        expect(sample.length, `${name}/${lang}`).toBeGreaterThan(0)
        expect(sample, `${name}/${lang}`).toContain('gw.example.com')
      }
    }
  })

  it('strips trailing slashes from the base URL before joining paths', () => {
    const sample = buildChatCompletionsSample('curl', {
      baseUrl: 'https://gw.example.com///',
    })
    expect(sample).toContain('https://gw.example.com/v1/chat/completions')
  })

  it('uses Bearer auth for OpenAI-format endpoints', () => {
    const curl = buildChatCompletionsSample('curl', CTX)
    expect(curl).toContain('https://gw.example.com/v1/chat/completions')
    expect(curl).toContain('Authorization: Bearer ${TOKENFUNC_API_KEY}')
  })

  it('adds stream flags to the streaming chat variants', () => {
    const curl = buildChatCompletionsSample('curl', CTX, { stream: true })
    const python = buildChatCompletionsSample('python', CTX, { stream: true })
    expect(curl).toContain('"stream": true')
    expect(python).toContain('stream=True')
  })

  it('uses x-api-key plus anthropic-version for the Anthropic endpoint', () => {
    const curl = buildMessagesSample('curl', CTX)
    expect(curl).toContain('https://gw.example.com/v1/messages')
    expect(curl).toContain('x-api-key: ${TOKENFUNC_API_KEY}')
    expect(curl).toContain('anthropic-version: 2023-06-01')
    expect(curl).toContain(`"model": "${SAMPLE_MODELS.anthropic}"`)
  })

  it('marks max_tokens as required in the Anthropic curl sample', () => {
    const curl = buildMessagesSample('curl', CTX)
    expect(curl).toContain('"max_tokens": 1024')
  })

  it('sends input (not messages) to the Responses endpoint', () => {
    const curl = buildResponsesSample('curl', CTX)
    const python = buildResponsesSample('python', CTX)
    expect(curl).toContain('https://gw.example.com/v1/responses')
    expect(curl).toContain('"input":')
    expect(python).toContain('input=')
  })

  it('uploads edits as multipart form data', () => {
    const curl = buildImageEditsSample('curl', CTX)
    const js = buildImageEditsSample('javascript', CTX)
    expect(curl).toContain('https://gw.example.com/v1/images/edits')
    expect(curl).toContain('-F image=@input.png')
    expect(js).toContain('FormData')
  })

  it('targets the image generations endpoint with an image model', () => {
    const curl = buildImageGenerationsSample('curl', CTX)
    expect(curl).toContain('https://gw.example.com/v1/images/generations')
    expect(curl).toContain(`"model": "${SAMPLE_MODELS.image}"`)
  })

  it('starts every python sample by importing os', () => {
    for (const build of Object.values(ALL_BUILDERS)) {
      expect(build('python', CTX).startsWith('import os')).toBe(true)
    }
  })
})

describe('tool configuration samples', () => {
  it('points Claude Code at the bare gateway and keeps the key in a variable', () => {
    const shell = buildClaudeCodeShellSample(CTX)
    expect(shell).toContain(`ANTHROPIC_BASE_URL="${BASE}"`)
    expect(shell).not.toContain(`${BASE}/v1`)
    expect(shell).toContain('ANTHROPIC_AUTH_TOKEN="${TOKENFUNC_API_KEY}"')

    const settings = buildClaudeCodeSettingsSample(CTX) as string
    const parsed = JSON.parse(settings) as {
      env: Record<string, string>
    }
    expect(parsed.env.ANTHROPIC_BASE_URL).toBe(BASE)
  })

  it('configures Codex with the /v1 base URL and the responses wire format', () => {
    const toml = buildCodexTomlSample(CTX)
    expect(toml).toContain(`base_url = "${BASE}/v1"`)
    expect(toml).toContain('wire_api = "responses"')
    expect(toml).toContain('env_key = "TOKENFUNC_API_KEY"')
  })

  it('registers an Anthropic-protocol provider for OpenClaw without /v1', () => {
    const parsed = JSON.parse(buildOpenClawProviderSample(CTX) as string) as {
      providers: { tokenfunc: { baseUrl: string; apiKey: string } }
    }
    expect(parsed.providers.tokenfunc.baseUrl).toBe(BASE)
    expect(parsed.providers.tokenfunc.apiKey).toBe('YOUR_API_KEY')
  })

  it('declares the Pi provider with the /v1 suffix and OpenAI protocol', () => {
    const parsed = JSON.parse(buildPiModelsSample(CTX) as string) as {
      tokenfunc: { baseUrl: string; api: string }
    }
    expect(parsed.tokenfunc.baseUrl).toBe(`${BASE}/v1`)
    expect(parsed.tokenfunc.api).toBe('openai-completions')
  })

  it('gives Hermes an OpenAI-compatible base URL including /v1', () => {
    const env = buildHermesEnvSample(CTX)
    expect(env).toContain(`OPENAI_BASE_URL="${BASE}/v1"`)
    expect(env).toContain('OPENAI_API_KEY="${TOKENFUNC_API_KEY}"')
  })
})
