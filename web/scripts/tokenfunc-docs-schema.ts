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
// tokenfunc 二开：从官方规范生成文档中心 API 参考页的字段树。
// 用法：bun run docs:schema [--cached] [--prune]
// - 来源：OpenAI 的 openapi.yaml、Anthropic API 参考的 Markdown 版、Gemini 的 discovery 文档；下载后缓存到仓库根目录 .tmp/docs-schema/
// - 输出 src/features/docs/schemas/<接口>.json（官方英文字段树，具名类型去重）
// - 对照 <接口>.zh.json 列出缺失翻译到 .tmp/docs-schema/<接口>.zh.missing.json，补完翻译后测试才会通过
// - --cached 直接用上次下载的规范；--prune 删除翻译表里已不再使用的条目（官方改了原文或删了字段）
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'

import {
  collectDescriptions,
  descriptionKey,
  type ApiSchema,
  type SchemaTranslations,
} from '../src/features/docs/lib/api-schema'
import { buildFromAnthropicMarkdown } from './tokenfunc-docs-schema/anthropic'
import {
  buildFromDiscovery,
  type DiscoveryDoc,
} from './tokenfunc-docs-schema/gemini'
import {
  buildFromOpenApi,
  type BuiltSchema,
  type OpenApiSpec,
} from './tokenfunc-docs-schema/openapi'

const SOURCES = {
  openai: {
    name: 'OpenAI',
    origin: 'https://platform.openai.com',
    url: 'https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml',
    file: 'openai.yaml',
    // 直连 GitHub 不稳定时改走 gh 命令行
    githubFallback: 'repos/openai/openai-openapi/contents/openapi.yaml',
  },
  anthropic: {
    name: 'Anthropic',
    origin: 'https://platform.claude.com',
    url: 'https://platform.claude.com/docs/en/api/messages.md',
    file: 'anthropic-messages.md',
  },
  gemini: {
    name: 'Gemini',
    origin: 'https://ai.google.dev',
    url: 'https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta',
    file: 'gemini-discovery.json',
  },
} as const

type SourceId = keyof typeof SOURCES

type Operation = {
  id: string
  source: SourceId
  docsUrl: string
  build: (spec: string) => { built: BuiltSchema; version: string }
}

/** requestContentType：同一接口有多种请求体时选文档主推的那种（如图片编辑用 multipart） */
function openApiOperation(
  apiPath: string,
  method: string,
  requestContentType?: string
) {
  return (spec: string) => {
    const doc = parse(spec) as OpenApiSpec
    return {
      built: buildFromOpenApi(doc, apiPath, method, requestContentType),
      version: doc.info.version,
    }
  }
}

/** 文档页用到的接口；新增接口在这里登记，再在正文写 :::schema{operation="<id>" part="request"} */
const OPERATIONS: Operation[] = [
  {
    id: 'chat-completions-create',
    source: 'openai',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat/create',
    build: openApiOperation('/chat/completions', 'post'),
  },
  {
    id: 'responses-create',
    source: 'openai',
    docsUrl: 'https://platform.openai.com/docs/api-reference/responses/create',
    build: openApiOperation('/responses', 'post'),
  },
  {
    id: 'images-generate',
    source: 'openai',
    docsUrl: 'https://platform.openai.com/docs/api-reference/images/create',
    build: openApiOperation('/images/generations', 'post'),
  },
  {
    id: 'images-edit',
    source: 'openai',
    docsUrl: 'https://platform.openai.com/docs/api-reference/images/createEdit',
    build: openApiOperation('/images/edits', 'post', 'multipart/form-data'),
  },
  {
    id: 'messages-create',
    source: 'anthropic',
    docsUrl: 'https://platform.claude.com/docs/en/api/messages',
    build: (spec) => ({
      built: buildFromAnthropicMarkdown(spec, 'Create a Message'),
      // 官方 Markdown 没有版本号，用内容哈希标记，原文不变就不产生差异
      version: descriptionKey(spec),
    }),
  },
  {
    id: 'gemini-generate-content',
    source: 'gemini',
    docsUrl: 'https://ai.google.dev/api/generate-content',
    build: (spec) => {
      const doc = JSON.parse(spec) as DiscoveryDoc
      return {
        built: buildFromDiscovery(doc, 'models', 'generateContent'),
        version: doc.revision ?? '',
      }
    },
  },
]

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaDir = path.join(webRoot, 'src/features/docs/schemas')
const tmpDir = path.resolve(webRoot, '../.tmp/docs-schema')

async function loadSpec(source: SourceId): Promise<string> {
  const meta = SOURCES[source]
  const cached = path.join(tmpDir, meta.file)
  if (process.argv.includes('--cached') && existsSync(cached)) {
    return readFileSync(cached, 'utf8')
  }
  let text: string
  try {
    const response = await fetch(meta.url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    text = await response.text()
  } catch (error) {
    if (!('githubFallback' in meta)) throw error
    console.warn(`fetch ${meta.url} failed (${String(error)}), trying gh api`)
    const result = spawnSync(
      'gh',
      ['api', '-H', 'Accept: application/vnd.github.raw', meta.githubFallback],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
    if (result.status !== 0) throw new Error(`gh api failed: ${result.stderr}`)
    text = result.stdout
  }
  writeFileSync(cached, text)
  return text
}

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as T)
    : fallback
}

function writeJson(file: string, data: unknown) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

async function main() {
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(schemaDir, { recursive: true })
  const specs = new Map<SourceId, string>()
  const knownZh: SchemaTranslations = Object.assign(
    {},
    ...OPERATIONS.map((op) =>
      readJson<SchemaTranslations>(path.join(schemaDir, `${op.id}.zh.json`), {})
    )
  )
  for (const op of OPERATIONS) {
    let spec = specs.get(op.source)
    if (spec === undefined) {
      spec = await loadSpec(op.source)
      specs.set(op.source, spec)
    }
    const { built, version } = op.build(spec)
    const source = SOURCES[op.source]
    const schema: ApiSchema = {
      source: {
        name: source.name,
        version,
        url: op.docsUrl,
        origin: source.origin,
      },
      request: built.request,
      response: built.response,
      defs: Object.fromEntries(
        Object.entries(built.defs).sort(([a], [b]) => a.localeCompare(b))
      ),
    }
    writeJson(path.join(schemaDir, `${op.id}.json`), schema)

    const overlayFile = path.join(schemaDir, `${op.id}.overlay.json`)
    if (!existsSync(overlayFile)) {
      writeJson(overlayFile, { request: {}, response: {} })
    }
    const zhFile = path.join(schemaDir, `${op.id}.zh.json`)
    const zh = readJson<SchemaTranslations>(zhFile, {})
    const used = new Map(
      [...collectDescriptions(schema)].map((text) => [
        descriptionKey(text),
        text,
      ])
    )
    // 同一句英文在别的接口已经翻译过的直接复用
    let reused = 0
    for (const key of used.keys()) {
      if (key in zh || !knownZh[key]) continue
      zh[key] = knownZh[key]
      reused++
    }
    const missing = Object.fromEntries(
      [...used].filter(([key]) => !(key in zh))
    )
    const stale = Object.keys(zh).filter((key) => !used.has(key))
    if (process.argv.includes('--prune') && stale.length) {
      stale.forEach((key) => delete zh[key])
    }
    if (!existsSync(zhFile) || reused || process.argv.includes('--prune')) {
      writeJson(
        zhFile,
        Object.fromEntries(
          Object.entries(zh).sort(([a], [b]) => a.localeCompare(b))
        )
      )
    }
    const missingFile = path.join(tmpDir, `${op.id}.zh.missing.json`)
    writeJson(missingFile, missing)
    console.log(
      `${op.id}: ${Object.keys(schema.defs).length} types, ${used.size} descriptions, ` +
        `${reused} reused, ${Object.keys(missing).length} missing zh, ${stale.length} stale zh`
    )
  }
}

await main()
// 生成的 JSON 按仓库格式化规则收尾，重新生成时 diff 只剩真实变化
spawnSync('bunx', ['oxfmt', '-c', '.oxfmtrc.json', '--write', schemaDir], {
  cwd: webRoot,
  stdio: 'inherit',
})
