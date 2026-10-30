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
// tokenfunc 二开：从官方 OpenAPI 规范生成文档中心 API 参考页的字段树。
// 用法：bun run docs:schema [--spec 本地规范文件] [--prune]
// - 输出 src/features/docs/schemas/<接口>.json（官方英文字段树，具名类型去重）
// - 对照 <接口>.zh.json 列出缺失翻译，写到仓库根目录 .tmp/docs-schema/<接口>.zh.missing.json，补完翻译后测试才会通过
// - --prune 删除翻译表里已不再使用的条目（官方改了原文或删了字段）
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'

import {
  collectDescriptions,
  descriptionKey,
  type ApiSchema,
  type SchemaField,
  type SchemaNode,
  type SchemaTranslations,
} from '../src/features/docs/lib/api-schema'

type RawSchema = Record<string, unknown> & {
  $ref?: string
  type?: string | string[]
  properties?: Record<string, RawSchema>
  required?: string[]
  items?: RawSchema
  additionalProperties?: boolean | RawSchema
  allOf?: RawSchema[]
  anyOf?: RawSchema[]
  oneOf?: RawSchema[]
  enum?: unknown[]
  const?: unknown
  title?: string
  description?: string
  deprecated?: boolean
  default?: unknown
  format?: string
}

type OpenApiSpec = {
  info: { version: string }
  paths: Record<string, Record<string, OpenApiOperation>>
  components: { schemas: Record<string, RawSchema> }
}

type OpenApiOperation = {
  requestBody: { content: Record<string, { schema: RawSchema }> }
  responses: Record<string, { content: Record<string, { schema: RawSchema }> }>
}

/** 文档页用到的接口；新增接口在这里登记，再在正文写 :::schema{operation="<id>" part="request"} */
const OPERATIONS = [
  {
    id: 'responses-create',
    source: 'openai',
    path: '/responses',
    method: 'post',
    docsUrl: 'https://platform.openai.com/docs/api-reference/responses/create',
  },
] as const

const SPEC_SOURCES = {
  openai: {
    name: 'OpenAI',
    url: 'https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml',
    githubRepo: 'openai/openai-openapi',
    githubPath: 'openapi.yaml',
  },
} as const

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaDir = path.join(webRoot, 'src/features/docs/schemas')
const tmpDir = path.resolve(webRoot, '../.tmp/docs-schema')

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function loadSpec(source: keyof typeof SPEC_SOURCES): Promise<string> {
  const local = argValue('--spec')
  if (local) return readFileSync(local, 'utf8')
  const meta = SPEC_SOURCES[source]
  const cached = path.join(tmpDir, `${source}.yaml`)
  try {
    const response = await fetch(meta.url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    writeFileSync(cached, text)
    return text
  } catch (error) {
    // 直连 GitHub 不稳定时改走 gh 命令行
    console.warn(`fetch ${meta.url} failed (${String(error)}), trying gh api`)
    const result = spawnSync(
      'gh',
      [
        'api',
        '-H',
        'Accept: application/vnd.github.raw',
        `repos/${meta.githubRepo}/contents/${meta.githubPath}`,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
    if (result.status !== 0) {
      throw new Error(`gh api failed: ${result.stderr}`)
    }
    writeFileSync(cached, result.stdout)
    return result.stdout
  }
}

/** 把 OpenAPI 3.1 的 schema 归一成字段树节点；具名类型放进 defs，按引用展开 */
class SchemaNormalizer {
  readonly defs: Record<string, SchemaNode> = {}

  constructor(private readonly spec: OpenApiSpec) {}

  private component(ref: string): RawSchema {
    const name = ref.split('/').pop() ?? ref
    const raw = this.spec.components.schemas[name]
    if (!raw) throw new Error(`Unknown schema ${ref}`)
    return raw
  }

  private meta(raw: RawSchema): Partial<SchemaNode> {
    const meta: Partial<SchemaNode> = {}
    if (raw.title) meta.title = raw.title
    if (raw.description?.trim()) meta.description = raw.description.trim()
    if (raw.deprecated) meta.deprecated = true
    if (raw.default !== undefined) meta.default = raw.default
    return meta
  }

  private withMeta(node: SchemaNode, raw: RawSchema): SchemaNode {
    // 外层的说明 / 默认值优先于被引用类型自身的
    return { ...node, ...this.meta(raw) } as SchemaNode
  }

  /** 请求体 / 响应体顶层：必填字段在前，其余按字母序，和官方参考文档一致便于对照 */
  normalizeRoot(raw: RawSchema): SchemaNode {
    const node = this.normalize(raw.$ref ? this.component(raw.$ref) : raw)
    if (node.kind !== 'object') return node
    const fields = [...node.fields].sort(
      (a, b) =>
        Number(b.required) - Number(a.required) || a.name.localeCompare(b.name)
    )
    return { ...node, fields }
  }

  normalize(raw: RawSchema): SchemaNode {
    if (raw.$ref) {
      const name = raw.$ref.split('/').pop() ?? raw.$ref
      if (!(name in this.defs)) {
        // 先占位，避免自引用的类型无限递归
        this.defs[name] = { kind: 'scalar', type: 'object' }
        this.defs[name] = this.normalize(this.component(raw.$ref))
      }
      return this.withMeta(
        { kind: 'ref', ref: name },
        { ...raw, title: undefined }
      )
    }
    if (raw.allOf?.length) return this.normalizeAllOf(raw)
    const options = raw.anyOf ?? raw.oneOf
    if (options?.length) return this.normalizeUnion(raw, options)
    if (Array.isArray(raw.type)) {
      const types = raw.type.filter((type) => type !== 'null')
      const nullable = types.length < raw.type.length
      const node =
        types.length === 1
          ? this.normalize({ ...raw, type: types[0] })
          : this.withMeta(
              {
                kind: 'union',
                variants: types.map((type) => this.normalize({ type })),
              },
              raw
            )
      return nullable ? { ...node, nullable: true } : node
    }
    if (raw.const !== undefined) {
      return this.withMeta(
        {
          kind: 'scalar',
          type: raw.type ?? typeof raw.const,
          enum: [raw.const],
        },
        raw
      )
    }
    if (raw.enum) {
      return this.withMeta(
        {
          kind: 'scalar',
          type: raw.type ?? 'string',
          enum: raw.enum.filter((value) => value !== null),
        },
        raw
      )
    }
    if (raw.type === 'array' || raw.items) {
      return this.withMeta(
        { kind: 'array', items: this.normalize(raw.items ?? {}) },
        raw
      )
    }
    if (raw.properties) {
      return this.withMeta({ kind: 'object', fields: this.fields(raw) }, raw)
    }
    if (typeof raw.additionalProperties === 'object') {
      return this.withMeta(
        { kind: 'map', values: this.normalize(raw.additionalProperties) },
        raw
      )
    }
    const scalar: SchemaNode = { kind: 'scalar', type: raw.type ?? 'any' }
    if (raw.format) scalar.format = raw.format
    return this.withMeta(scalar, raw)
  }

  private fields(raw: RawSchema): SchemaField[] {
    const required = new Set(raw.required ?? [])
    return Object.entries(raw.properties ?? {}).map(([name, child]) => ({
      name,
      required: required.has(name),
      node: this.normalize(child),
    }))
  }

  /** allOf 多为对象拼接：把各部分的字段按顺序合并，后出现的同名字段覆盖前面的 */
  private normalizeAllOf(raw: RawSchema): SchemaNode {
    const parts = raw.allOf ?? []
    if (parts.length === 1) {
      return this.withMeta(this.normalize(parts[0]), raw)
    }
    const merged: RawSchema = { type: 'object', properties: {}, required: [] }
    const absorb = (part: RawSchema) => {
      const resolved = part.$ref ? this.component(part.$ref) : part
      resolved.allOf?.forEach(absorb)
      Object.assign(merged.properties ?? {}, resolved.properties)
      merged.required?.push(...(resolved.required ?? []))
    }
    parts.forEach(absorb)
    const { allOf: _allOf, ...rest } = raw
    return this.normalize({ ...rest, ...merged })
  }

  private normalizeUnion(raw: RawSchema, options: RawSchema[]): SchemaNode {
    const variants = options.filter((option) => option.type !== 'null')
    const nullable = variants.length < options.length
    const { anyOf: _anyOf, oneOf: _oneOf, ...rest } = raw
    if (variants.length === 1) {
      const node = this.normalize({ ...variants[0], ...this.meta(rest) })
      return nullable ? { ...node, nullable: true } : node
    }
    const normalized = variants.map((variant) => this.normalize(variant))
    // 全是字符串取值的「多选一」合并成一个枚举，避免一层没有信息量的展开
    const enumValues = normalized.flatMap((node) =>
      node.kind === 'scalar' && node.enum && !node.description ? node.enum : []
    )
    const allEnums = normalized.every(
      (node) => node.kind === 'scalar' && node.enum && !node.description
    )
    const node: SchemaNode =
      allEnums && enumValues.length
        ? { kind: 'scalar', type: 'string', enum: enumValues }
        : { kind: 'union', variants: normalized }
    const result = this.withMeta(node, rest)
    return nullable ? { ...result, nullable: true } : result
  }
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
  const specs = new Map<string, OpenApiSpec>()
  for (const op of OPERATIONS) {
    let spec = specs.get(op.source)
    if (!spec) {
      spec = parse(await loadSpec(op.source)) as OpenApiSpec
      specs.set(op.source, spec)
    }
    const operation = spec.paths[op.path]?.[op.method]
    if (!operation) throw new Error(`${op.method} ${op.path} not found`)
    const normalizer = new SchemaNormalizer(spec)
    const request = normalizer.normalizeRoot(
      operation.requestBody.content['application/json'].schema
    )
    const response = normalizer.normalizeRoot(
      operation.responses['200'].content['application/json'].schema
    )
    const schema: ApiSchema = {
      source: {
        name: SPEC_SOURCES[op.source].name,
        version: spec.info.version,
        url: op.docsUrl,
      },
      request,
      response,
      defs: Object.fromEntries(
        Object.entries(normalizer.defs).sort(([a], [b]) => a.localeCompare(b))
      ),
    }
    writeJson(path.join(schemaDir, `${op.id}.json`), schema)

    const zhFile = path.join(schemaDir, `${op.id}.zh.json`)
    const zh = readJson<SchemaTranslations>(zhFile, {})
    const used = new Map(
      [...collectDescriptions(schema)].map((text) => [
        descriptionKey(text),
        text,
      ])
    )
    const missing = Object.fromEntries(
      [...used].filter(([key]) => !(key in zh))
    )
    const stale = Object.keys(zh).filter((key) => !used.has(key))
    if (process.argv.includes('--prune') && stale.length) {
      stale.forEach((key) => delete zh[key])
      writeJson(zhFile, zh)
    }
    const missingFile = path.join(tmpDir, `${op.id}.zh.missing.json`)
    writeJson(missingFile, missing)
    console.log(
      `${op.id}: ${Object.keys(schema.defs).length} types, ${used.size} descriptions, ` +
        `${Object.keys(missing).length} missing zh (${missingFile}), ${stale.length} stale zh`
    )
  }
}

await main()
// 生成的 JSON 按仓库格式化规则收尾，重新生成时 diff 只剩真实变化
spawnSync('bunx', ['oxfmt', '-c', '.oxfmtrc.json', '--write', schemaDir], {
  cwd: webRoot,
  stdio: 'inherit',
})
