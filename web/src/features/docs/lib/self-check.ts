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
// tokenfunc 二开：文档中心「连接自检」的检查逻辑。只做判断与请求，文案由组件按 code 翻译。
import type { ModelFamily } from '../registry'

export type SelfCheckProtocol = 'anthropic' | 'openai-chat' | 'openai-responses'

/** 工具要求的地址写法：root = 只填站点地址，v1 = 站点地址 + /v1 */
export type AddressStyle = 'root' | 'v1'

export type SelfCheckTool = {
  id: string
  label: string
  protocol: SelfCheckProtocol
  address: AddressStyle
  family: ModelFamily
  /** 对应教程页 */
  guide: string
}

export const SELF_CHECK_TOOLS: SelfCheckTool[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    protocol: 'anthropic',
    address: 'root',
    family: 'claude',
    guide: 'tools-claude-code',
  },
  {
    id: 'codex',
    label: 'Codex',
    protocol: 'openai-responses',
    address: 'v1',
    family: 'gpt',
    guide: 'tools-codex',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    protocol: 'openai-chat',
    address: 'v1',
    family: 'gpt',
    guide: 'tools-cursor',
  },
  {
    id: 'cline-openai',
    label: 'Cline (OpenAI Compatible)',
    protocol: 'openai-chat',
    address: 'v1',
    family: 'claude',
    guide: 'tools-cline',
  },
  {
    id: 'cline-anthropic',
    label: 'Cline (Anthropic)',
    protocol: 'anthropic',
    address: 'root',
    family: 'claude',
    guide: 'tools-cline',
  },
  {
    id: 'trae-openai',
    label: 'Trae (OpenAI)',
    protocol: 'openai-chat',
    address: 'v1',
    family: 'deepseek',
    guide: 'tools-trae',
  },
  {
    id: 'trae-anthropic',
    label: 'Trae (Anthropic)',
    protocol: 'anthropic',
    address: 'root',
    family: 'claude',
    guide: 'tools-trae',
  },
  {
    id: 'workbuddy',
    label: 'WorkBuddy',
    protocol: 'openai-chat',
    address: 'v1',
    family: 'deepseek',
    guide: 'tools-workbuddy',
  },
  {
    id: 'deepseek-harness',
    label: 'DeepSeek Harness',
    protocol: 'openai-chat',
    address: 'v1',
    family: 'deepseek',
    guide: 'tools-deepseek-harness',
  },
  {
    id: 'hermes',
    label: 'Hermes Agent',
    protocol: 'openai-chat',
    address: 'v1',
    family: 'claude',
    guide: 'tools-hermes',
  },
  {
    id: 'pi',
    label: 'Pi',
    protocol: 'openai-chat',
    address: 'v1',
    family: 'claude',
    guide: 'tools-pi',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    protocol: 'openai-chat',
    address: 'v1',
    family: 'claude',
    guide: 'tools-openclaw',
  },
  {
    id: 'openai-client',
    label: 'Other OpenAI-compatible clients',
    protocol: 'openai-chat',
    address: 'v1',
    family: 'gpt',
    guide: 'tools-openai-client',
  },
]

/** 教程页 → 默认选中的工具，供教程页上的自检入口预选 */
export function toolForGuide(slug: string): SelfCheckTool | undefined {
  return SELF_CHECK_TOOLS.find((tool) => tool.guide === slug)
}

export function findSelfCheckTool(id: string | undefined): SelfCheckTool {
  return SELF_CHECK_TOOLS.find((tool) => tool.id === id) ?? SELF_CHECK_TOOLS[0]
}

function trimSlashes(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function expectedAddress(baseUrl: string, style: AddressStyle): string {
  const base = trimSlashes(baseUrl)
  return style === 'v1' ? `${base}/v1` : base
}

export type AddressIssue =
  | 'empty'
  | 'ok'
  | 'invalid'
  | 'other-host'
  | 'scheme'
  | 'extra-v1'
  | 'missing-v1'
  | 'full-path'
  | 'unexpected-path'

/** 比较用户在工具里填的地址与该工具要求的写法，不发请求 */
export function checkAddress(
  entered: string,
  baseUrl: string,
  style: AddressStyle
): AddressIssue {
  const value = trimSlashes(entered)
  if (!value) return 'empty'
  let actual: URL
  let site: URL
  try {
    actual = new URL(value)
    site = new URL(trimSlashes(baseUrl))
  } catch {
    return 'invalid'
  }
  if (actual.host.toLowerCase() !== site.host.toLowerCase()) return 'other-host'

  const sitePath = trimSlashes(site.pathname)
  const path = trimSlashes(actual.pathname)
  const relative = path.startsWith(sitePath)
    ? path.slice(sitePath.length)
    : path
  if (/\/(chat\/completions|messages|responses)$/.test(relative)) {
    return 'full-path'
  }
  if (style === 'root' && relative === '/v1') return 'extra-v1'
  if (style === 'v1' && relative === '') return 'missing-v1'
  if (relative !== (style === 'v1' ? '/v1' : '')) return 'unexpected-path'
  if (actual.protocol !== site.protocol) return 'scheme'
  return 'ok'
}

export type CallFailure =
  | 'network'
  | 'invalid-key'
  | 'insufficient-quota'
  | 'forbidden'
  | 'not-found'
  | 'no-channel'
  | 'bad-request'
  | 'rate-limited'
  | 'server-error'

/** 从 OpenAI 或 Anthropic 风格的错误体里取出可读的报错信息 */
export function readErrorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const error = (body as { error?: unknown; message?: unknown }).error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  const message = (body as { message?: unknown }).message
  return typeof message === 'string' ? message : ''
}

/** 把网关返回的状态码与报错归类，决定给用户的修复建议 */
export function classifyFailure(status: number, body: unknown): CallFailure {
  const message = readErrorMessage(body).toLowerCase()
  const code =
    body && typeof body === 'object'
      ? String(
          ((body as { error?: { code?: unknown } }).error?.code as string) ?? ''
        )
      : ''
  if (status === 401) return 'invalid-key'
  if (status === 403) {
    if (
      code === 'insufficient_user_quota' ||
      message.includes('quota') ||
      message.includes('额度')
    ) {
      return 'insufficient-quota'
    }
    return 'forbidden'
  }
  if (status === 404) return 'not-found'
  if (status === 429) return 'rate-limited'
  if (code === 'model_not_found' || status === 503) return 'no-channel'
  if (status >= 400 && status < 500) return 'bad-request'
  return 'server-error'
}

export type CallRequest = { url: string; init: RequestInit }

/** 按工具的协议构造一次最小的真实调用（只生成 1 个左右的 Token） */
export function buildProbeRequest(
  baseUrl: string,
  protocol: SelfCheckProtocol,
  apiKey: string,
  model: string
): CallRequest {
  const base = trimSlashes(baseUrl)
  if (protocol === 'anthropic') {
    return {
      url: `${base}/v1/messages`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      },
    }
  }
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (protocol === 'openai-responses') {
    // Responses 接口要求 max_output_tokens 不小于 16
    return {
      url: `${base}/v1/responses`,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input: 'ping', max_output_tokens: 16 }),
      },
    }
  }
  return {
    url: `${base}/v1/chat/completions`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    },
  }
}
