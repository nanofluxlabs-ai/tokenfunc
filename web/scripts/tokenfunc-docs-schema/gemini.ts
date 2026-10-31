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
// tokenfunc 二开：Gemini 官方 discovery 文档（Google API 描述格式）→ 文档字段树。
// discovery 不标必填，字段说明以 "Required." 开头的视为必填；枚举的逐项说明并入字段说明。
import type {
  SchemaField,
  SchemaNode,
} from '../../src/features/docs/lib/api-schema'
import type { BuiltSchema } from './openapi'

type DiscoverySchema = {
  $ref?: string
  type?: string
  description?: string
  properties?: Record<string, DiscoverySchema>
  items?: DiscoverySchema
  additionalProperties?: DiscoverySchema
  enum?: string[]
  enumDescriptions?: string[]
  format?: string
  deprecated?: boolean
}

export type DiscoveryDoc = {
  revision?: string
  schemas: Record<string, DiscoverySchema>
  resources: Record<
    string,
    {
      methods?: Record<
        string,
        { request?: { $ref: string }; response?: { $ref: string } }
      >
    }
  >
}

class DiscoveryNormalizer {
  readonly defs: Record<string, SchemaNode> = {}

  constructor(private readonly doc: DiscoveryDoc) {}

  private description(raw: DiscoverySchema): string | undefined {
    const base = raw.description?.trim() ?? ''
    // 枚举值的说明并入字段说明，跳过占位的 UNSPECIFIED
    const values = (raw.enum ?? [])
      .map((value, index) => ({ value, text: raw.enumDescriptions?.[index] }))
      .filter((entry) => entry.text && !entry.value.endsWith('_UNSPECIFIED'))
      .map((entry) => `- \`${entry.value}\`: ${entry.text}`)
    const text = [base, values.join('\n')].filter(Boolean).join('\n\n')
    return text || undefined
  }

  private withMeta(node: SchemaNode, raw: DiscoverySchema): SchemaNode {
    const description = this.description(raw)
    const result = { ...node } as SchemaNode
    if (description) result.description = description
    if (raw.deprecated) result.deprecated = true
    return result
  }

  normalizeRoot(ref: string): SchemaNode {
    return this.normalize(this.doc.schemas[ref] ?? {})
  }

  normalize(raw: DiscoverySchema): SchemaNode {
    if (raw.$ref) {
      const name = raw.$ref
      if (!(name in this.defs)) {
        // 先占位，避免自引用的类型无限递归
        this.defs[name] = { kind: 'scalar', type: 'object' }
        const target = this.doc.schemas[name]
        if (!target) throw new Error(`Unknown schema ${name}`)
        this.defs[name] = this.normalize(target)
      }
      return this.withMeta({ kind: 'ref', ref: name }, raw)
    }
    if (raw.type === 'array') {
      return this.withMeta(
        { kind: 'array', items: this.normalize(raw.items ?? {}) },
        raw
      )
    }
    if (raw.properties) {
      // discovery 的字段顺序不稳定：去掉下划线开头的内部字段，必填在前、其余按字母序
      const fields: SchemaField[] = Object.entries(raw.properties)
        .filter(([name]) => !name.startsWith('_'))
        .map(([name, child]) => ({
          name,
          required: /^Required\b/.test(child.description?.trim() ?? ''),
          node: this.normalize(child),
        }))
        .sort(
          (a, b) =>
            Number(b.required) - Number(a.required) ||
            a.name.localeCompare(b.name)
        )
      return this.withMeta({ kind: 'object', fields }, raw)
    }
    if (raw.additionalProperties) {
      return this.withMeta(
        { kind: 'map', values: this.normalize(raw.additionalProperties) },
        raw
      )
    }
    const scalar: SchemaNode = { kind: 'scalar', type: raw.type ?? 'any' }
    // *_UNSPECIFIED 是 proto 枚举的占位值，不是可传的取值
    if (raw.enum) {
      scalar.enum = raw.enum.filter((value) => !value.endsWith('_UNSPECIFIED'))
    }
    if (raw.format) scalar.format = raw.format
    return this.withMeta(scalar, raw)
  }
}

export function buildFromDiscovery(
  doc: DiscoveryDoc,
  resource: string,
  method: string
): BuiltSchema {
  const target = doc.resources[resource]?.methods?.[method]
  if (!target?.request || !target.response) {
    throw new Error(`${resource}.${method} not found`)
  }
  const normalizer = new DiscoveryNormalizer(doc)
  return {
    request: normalizer.normalizeRoot(target.request.$ref),
    response: normalizer.normalizeRoot(target.response.$ref),
    defs: normalizer.defs,
  }
}
