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
// tokenfunc 二开：API 参考页的字段树。数据由 scripts/tokenfunc-docs-schema.ts 从官方 OpenAPI 规范生成，
// 页面按需展开嵌套字段。生成脚本与浏览器共用本模块，因此只能用相对路径，不能引用 @/ 别名或 React。

/** 节点共有的展示信息；description 是官方英文原文，中文按其哈希在翻译表里查 */
type SchemaMeta = {
  title?: string
  description?: string
  deprecated?: boolean
  nullable?: boolean
  default?: unknown
}

export type SchemaNode = SchemaMeta &
  (
    | {
        kind: 'scalar'
        type: string
        enum?: unknown[]
        format?: string
      }
    | { kind: 'object'; fields: SchemaField[] }
    | { kind: 'map'; values: SchemaNode }
    | { kind: 'array'; items: SchemaNode }
    | { kind: 'union'; variants: SchemaNode[] }
    | { kind: 'ref'; ref: string }
  )

export type SchemaField = {
  name: string
  required: boolean
  node: SchemaNode
}

/** 一个接口的字段树：请求体、响应体，以及二者共用的具名类型（展开时才解析，避免循环引用） */
export type ApiSchema = {
  source: { name: string; version: string; url: string }
  request: SchemaNode
  response: SchemaNode
  defs: Record<string, SchemaNode>
}

/** 中文翻译表：英文说明的哈希 → 中文 */
export type SchemaTranslations = Record<string, string>

/** 本站差异：按字段路径（如 tools.type）标注不转发或补充说明 */
export type SchemaOverlayEntry = {
  status?: 'not-forwarded'
  note?: { zh: string; en: string }
}

export type SchemaOverlay = {
  request: Record<string, SchemaOverlayEntry>
  response: Record<string, SchemaOverlayEntry>
}

/** 英文说明的稳定短哈希（cyrb53），原文一改哈希就变，同步脚本据此找出待翻译条目 */
export function descriptionKey(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** 解开具名引用，返回实际节点；引用名缺失时返回 undefined */
export function resolveNode(
  schema: ApiSchema,
  node: SchemaNode
): SchemaNode | undefined {
  let current: SchemaNode | undefined = node
  const seen = new Set<string>()
  while (current?.kind === 'ref') {
    if (seen.has(current.ref)) return undefined
    seen.add(current.ref)
    current = schema.defs[current.ref]
  }
  return current
}

/** 节点的类型标签，如 string、array of object、string or array */
export function describeType(
  schema: ApiSchema,
  node: SchemaNode,
  depth = 0
): string {
  const resolved = resolveNode(schema, node)
  if (!resolved || depth > 3) return 'object'
  switch (resolved.kind) {
    case 'scalar':
      return resolved.type
    case 'object':
      return 'object'
    case 'map':
      return 'map'
    case 'array':
      return `array of ${describeType(schema, resolved.items, depth + 1)}`
    case 'union': {
      const labels = [
        ...new Set(
          resolved.variants.map((variant) =>
            describeType(schema, variant, depth + 1)
          )
        ),
      ]
      return labels.join(' or ')
    }
  }
  return 'object'
}

/** 节点展开后能看到的子项：对象字段，或「多选一」的各个类型 */
export type SchemaChildren =
  | { kind: 'fields'; fields: SchemaField[] }
  | { kind: 'variants'; variants: SchemaNode[] }

export function childrenOf(
  schema: ApiSchema,
  node: SchemaNode
): SchemaChildren | undefined {
  const resolved = resolveNode(schema, node)
  if (!resolved) return undefined
  switch (resolved.kind) {
    case 'object':
      return resolved.fields.length
        ? { kind: 'fields', fields: resolved.fields }
        : undefined
    case 'map':
      return childrenOf(schema, resolved.values)
    case 'array':
      return childrenOf(schema, resolved.items)
    case 'union': {
      const expandable = resolved.variants.filter(
        (variant) =>
          childrenOf(schema, variant) || variantDescription(schema, variant)
      )
      return expandable.length
        ? { kind: 'variants', variants: resolved.variants }
        : undefined
    }
    default:
      return undefined
  }
}

/** 节点自身或其引用目标上的说明（引用节点本身通常没有说明） */
export function variantDescription(
  schema: ApiSchema,
  node: SchemaNode
): string | undefined {
  return node.description ?? resolveNode(schema, node)?.description
}

/** 「多选一」里某个类型的显示名：优先官方标题，其次引用名，最后用类型标签 */
export function variantTitle(schema: ApiSchema, node: SchemaNode): string {
  if (node.title) return node.title
  if (node.kind === 'ref') return schema.defs[node.ref]?.title ?? node.ref
  const resolved = resolveNode(schema, node)
  if (resolved?.kind === 'scalar' && resolved.enum?.length === 1) {
    return JSON.stringify(resolved.enum[0])
  }
  return describeType(schema, node)
}

/** 收集字段树里全部英文说明，供翻译完整性检查与同步脚本使用 */
export function collectDescriptions(schema: ApiSchema): Set<string> {
  const texts = new Set<string>()
  const walk = (node: SchemaNode) => {
    if (node.description) texts.add(node.description)
    switch (node.kind) {
      case 'object':
        node.fields.forEach((field) => walk(field.node))
        break
      case 'map':
        walk(node.values)
        break
      case 'array':
        walk(node.items)
        break
      case 'union':
        node.variants.forEach(walk)
        break
    }
  }
  walk(schema.request)
  walk(schema.response)
  Object.values(schema.defs).forEach(walk)
  return texts
}
