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
// tokenfunc 二开：文档中心的页面结构。正文在 content/<lang>/<slug>.md，中文与英文各一份；
// 标题与摘要写在这里，侧栏、SEO 预渲染与 sitemap 共用，因此本文件只能使用相对路径导入。
import type { DocsLang } from './lib/doc-markdown'

export type { DocsLang }

export const DOCS_LANGS: DocsLang[] = ['zh', 'en']

/** 不带 ?lang 时的正文语言；预渲染与 sitemap 的规范地址也以它为准 */
export const DOCS_DEFAULT_LANG: DocsLang = 'zh'

export type DocsGroupId = 'getting-started' | 'api' | 'enterprise' | 'tools'

/** 示例模型的系列：页面里的 {{model}} 按系列从本站可用模型中挑一个 */
export type ModelFamily = 'claude' | 'gpt' | 'deepseek' | 'gemini' | 'image'

export type Localized = Record<DocsLang, string>

export type DocsPageEntry = {
  slug: string
  group: DocsGroupId
  title: Localized
  description: Localized
  /** 页面里 {{model}} 默认取的模型系列；不写则页面不出现模型选择 */
  model?: ModelFamily
}

export type DocsNavGroup = {
  id: DocsGroupId
  title: Localized
  pages: DocsPageEntry[]
}

export const DOCS_GROUPS: { id: DocsGroupId; title: Localized }[] = [
  { id: 'getting-started', title: { zh: '开始使用', en: 'Getting started' } },
  { id: 'api', title: { zh: 'API 参考', en: 'API reference' } },
  { id: 'enterprise', title: { zh: '企业客户', en: 'Enterprise' } },
  { id: 'tools', title: { zh: '三方工具接入', en: 'Tool integration' } },
]

export const DOCS_PAGES: DocsPageEntry[] = [
  {
    slug: 'quick-start',
    group: 'getting-started',
    model: 'gpt',
    title: { zh: '快速开始', en: 'Quick start' },
    description: {
      zh: '三步拿到密钥并发出第一个请求。',
      en: 'Get a key and send your first request in three steps.',
    },
  },
  {
    slug: 'self-check',
    group: 'getting-started',
    title: { zh: '连接自检', en: 'Connection check' },
    description: {
      zh: '工具里配置后连不上？选好工具，一键检查地址、密钥、模型权限和实际调用。',
      en: 'Tool not connecting? Pick the tool and check the address, key, model access and a real call in one go.',
    },
  },
  {
    slug: 'concepts',
    group: 'getting-started',
    title: { zh: '基础概念', en: 'Core concepts' },
    description: {
      zh: '接口地址、密钥、分组、模型名与计费，接入前需要知道的五件事。',
      en: 'Base URL, keys, groups, model names and billing: five things to know first.',
    },
  },
  {
    slug: 'faq',
    group: 'getting-started',
    title: { zh: '常见问题与排错', en: 'FAQ and troubleshooting' },
    description: {
      zh: '按报错信息查原因：401、403、404、模型不存在、余额不足、超时。',
      en: 'Find the cause from the error: 401, 403, 404, model not found, out of credit, timeouts.',
    },
  },
  {
    slug: 'tools-overview',
    group: 'tools',
    title: { zh: '选择接入方式', en: 'Choose a tool' },
    description: {
      zh: '各工具使用的协议、接口地址写法与推荐模型一览。',
      en: 'Protocol, base URL format and recommended models for each tool.',
    },
  },
  {
    slug: 'tools-claude-code',
    group: 'tools',
    model: 'claude',
    title: { zh: 'Claude Code', en: 'Claude Code' },
    description: {
      zh: '用 CC Switch 一键导入或环境变量，把 Claude Code 接到本站。',
      en: 'Point Claude Code at this site with a one-click CC Switch import or environment variables.',
    },
  },
  {
    slug: 'tools-codex',
    group: 'tools',
    model: 'gpt',
    title: { zh: 'Codex', en: 'Codex' },
    description: {
      zh: '在 config.toml 中添加自定义模型提供方，让 Codex CLI 走本站。',
      en: 'Add a custom model provider in config.toml so the Codex CLI uses this site.',
    },
  },
  {
    slug: 'tools-cursor',
    group: 'tools',
    model: 'gpt',
    title: { zh: 'Cursor', en: 'Cursor' },
    description: {
      zh: '在 Cursor 设置里覆盖 OpenAI Base URL 并添加自定义模型。',
      en: 'Override the OpenAI base URL in Cursor settings and add custom models.',
    },
  },
  {
    slug: 'tools-cline',
    group: 'tools',
    model: 'claude',
    title: { zh: 'Cline', en: 'Cline' },
    description: {
      zh: '在 VS Code 的 Cline 插件里配置自定义提供方。',
      en: 'Configure a custom provider in the Cline VS Code extension.',
    },
  },
  {
    slug: 'tools-trae',
    group: 'tools',
    model: 'deepseek',
    title: { zh: 'Trae', en: 'Trae' },
    description: {
      zh: '在 Trae 的模型设置中添加自定义模型。',
      en: 'Add a custom model in Trae model settings.',
    },
  },
  {
    slug: 'tools-workbuddy',
    group: 'tools',
    model: 'deepseek',
    title: { zh: 'WorkBuddy', en: 'WorkBuddy' },
    description: {
      zh: '在 WorkBuddy 的自定义模型里填入本站地址与密钥。',
      en: 'Enter this site and your key in WorkBuddy custom model settings.',
    },
  },
  {
    slug: 'tools-deepseek-harness',
    group: 'tools',
    model: 'deepseek',
    title: { zh: 'DeepSeek Harness', en: 'DeepSeek Harness' },
    description: {
      zh: '给 DeepSeek Harness（dsh）配置自定义提供方。',
      en: 'Configure a custom provider for DeepSeek Harness (dsh).',
    },
  },
  {
    slug: 'tools-hermes',
    group: 'tools',
    model: 'claude',
    title: { zh: 'Hermes Agent', en: 'Hermes Agent' },
    description: {
      zh: '让 Hermes Agent 通过自定义端点调用本站模型。',
      en: 'Connect Hermes Agent through a custom endpoint.',
    },
  },
  {
    slug: 'tools-pi',
    group: 'tools',
    model: 'claude',
    title: { zh: 'Pi', en: 'Pi' },
    description: {
      zh: '在 Pi 的 models.json 中添加自定义提供方。',
      en: 'Add a custom provider to the Pi models.json.',
    },
  },
  {
    slug: 'tools-openclaw',
    group: 'tools',
    model: 'claude',
    title: { zh: 'OpenClaw', en: 'OpenClaw' },
    description: {
      zh: '为 OpenClaw 添加自定义 Anthropic 提供方。',
      en: 'Add a custom Anthropic provider to OpenClaw.',
    },
  },
  {
    slug: 'tools-openai-client',
    group: 'tools',
    model: 'gpt',
    title: {
      zh: '其他 OpenAI 兼容客户端',
      en: 'Other OpenAI-compatible clients',
    },
    description: {
      zh: 'Cherry Studio、Chatbox、各语言 SDK 等支持自定义地址的客户端通用填法。',
      en: 'Common settings for Cherry Studio, Chatbox, SDKs and other clients with a custom base URL.',
    },
  },
  {
    slug: 'api-authentication',
    group: 'api',
    title: { zh: '鉴权', en: 'Authentication' },
    description: {
      zh: '在请求头中携带密钥的几种写法。',
      en: 'The ways to send your key in request headers.',
    },
  },
  {
    slug: 'api-models',
    group: 'api',
    title: { zh: '模型列表', en: 'List models' },
    description: {
      zh: '查询当前密钥可以使用的模型。',
      en: 'List the models your key can use.',
    },
  },
  {
    slug: 'api-chat-completions',
    group: 'api',
    model: 'gpt',
    title: { zh: 'Chat Completions', en: 'Chat Completions' },
    description: {
      zh: 'OpenAI 兼容的对话接口：流式输出、思考模型、看图、工具调用、结构化输出的参数与示例。',
      en: 'The OpenAI-compatible chat endpoint: streaming, reasoning, vision, tool calling and structured output.',
    },
  },
  {
    slug: 'api-messages',
    group: 'api',
    model: 'claude',
    title: { zh: 'Anthropic Messages', en: 'Anthropic Messages' },
    description: {
      zh: 'Anthropic 原生格式的对话接口：思考、看图、工具调用与提示词缓存。',
      en: 'The Anthropic-native chat endpoint: thinking, vision, tool use and prompt caching.',
    },
  },
  {
    slug: 'api-responses',
    group: 'api',
    model: 'gpt',
    title: { zh: 'Responses', en: 'Responses' },
    description: {
      zh: 'OpenAI Responses 接口，Codex 等工具使用它。',
      en: 'The OpenAI Responses endpoint used by Codex and similar tools.',
    },
  },
  {
    slug: 'api-images',
    group: 'api',
    model: 'image',
    title: { zh: '图片生成', en: 'Image generation' },
    description: {
      zh: '文生图与图片编辑。',
      en: 'Generate and edit images.',
    },
  },
  {
    slug: 'api-errors',
    group: 'api',
    title: { zh: '错误码', en: 'Errors' },
    description: {
      zh: '错误响应格式、状态码与重试建议。',
      en: 'Error format, status codes and retry guidance.',
    },
  },
  {
    slug: 'enterprise-integration',
    group: 'enterprise',
    title: { zh: '企业接入指南', en: 'Enterprise integration guide' },
    description: {
      zh: '给员工发放密钥、查询授信额度、读取账单。',
      en: 'Issue employee keys, query credit and read bills.',
    },
  },
]

export const DOCS_DEFAULT_SLUG = 'quick-start'

export const DOCS_SLUGS: string[] = DOCS_PAGES.map((page) => page.slug)

export function resolveDocSlug(slug: string | undefined): string {
  return slug && DOCS_SLUGS.includes(slug) ? slug : DOCS_DEFAULT_SLUG
}

/** 正文语言跟随站点界面语言：简繁中文看中文正文，其余语言看英文正文 */
export function docsLangFromUiLanguage(language: string | undefined): DocsLang {
  return language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function getDocsEntry(slug: string): DocsPageEntry {
  const resolved = resolveDocSlug(slug)
  return DOCS_PAGES.find((page) => page.slug === resolved) ?? DOCS_PAGES[0]
}

export function getDocsNav(): DocsNavGroup[] {
  return DOCS_GROUPS.map((group) => ({
    ...group,
    pages: DOCS_PAGES.filter((page) => page.group === group.id),
  }))
}

/** 翻页顺序跟随侧栏分组顺序 */
export function getPagerNeighbors(slug: string): {
  prev?: DocsPageEntry
  next?: DocsPageEntry
} {
  const ordered = getDocsNav().flatMap((group) => group.pages)
  const index = ordered.findIndex((page) => page.slug === resolveDocSlug(slug))
  if (index === -1) return {}
  return { prev: ordered[index - 1], next: ordered[index + 1] }
}
