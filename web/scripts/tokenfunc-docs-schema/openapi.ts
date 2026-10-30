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
// tokenfunc 二开：OpenAPI 3.1 规范（OpenAI）→ 文档字段树
import type {
  SchemaField,
  SchemaNode,
} from '../../src/features/docs/lib/api-schema'

export type RawSchema = Record<string, unknown> & {
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

export type OpenApiSpec = {
  info: { version: string }
  paths: Record<string, Record<string, OpenApiOperation>>
  components: { schemas: Record<string, RawSchema> }
}

type OpenApiContent = Record<string, { schema: RawSchema }>

type OpenApiOperation = {
  requestBody?: { content: OpenApiContent }
  responses: Record<string, { content?: OpenApiContent }>
}

export type BuiltSchema = {
  request: SchemaNode
  response: SchemaNode
  defs: Record<string, SchemaNode>
}

/** 按指定内容类型取请求 / 响应体，默认 JSON，没有时取第一种 */
function bodySchema(
  content: OpenApiContent | undefined,
  contentType = 'application/json'
): RawSchema | undefined {
  if (!content) return undefined
  return (content[contentType] ?? Object.values(content)[0])?.schema
}

export function buildFromOpenApi(
  spec: OpenApiSpec,
  apiPath: string,
  method: string,
  requestContentType?: string
): BuiltSchema {
  const operation = spec.paths[apiPath]?.[method]
  if (!operation) throw new Error(`${method} ${apiPath} not found`)
  const normalizer = new SchemaNormalizer(spec)
  const requestSchema = bodySchema(
    operation.requestBody?.content,
    requestContentType
  )
  const responseSchema = bodySchema(operation.responses['200']?.content)
  if (!responseSchema) throw new Error(`${method} ${apiPath} has no 200 body`)
  return {
    // 列表类 GET 接口没有请求体
    request: requestSchema
      ? normalizer.normalizeRoot(requestSchema)
      : { kind: 'object', fields: [] },
    response: normalizer.normalizeRoot(responseSchema),
    defs: normalizer.defs,
  }
}

/** 把 OpenAPI 3.1 的 schema 归一成字段树节点；具名类型放进 defs，按引用展开 */
export class SchemaNormalizer {
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
