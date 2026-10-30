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
// tokenfunc 二开：:::schema 挂件可用的接口；每个接口的字段树、中文翻译与本站差异按页面懒加载，不进首屏包
import type { ApiSchema, SchemaOverlay, SchemaTranslations } from './api-schema'

export type SchemaBundle = {
  schema: ApiSchema
  zh: SchemaTranslations
  overlay: SchemaOverlay
}

/** 与 scripts/tokenfunc-docs-schema.ts 的 OPERATIONS 一一对应，测试会校验两边一致 */
export const SCHEMA_OPERATIONS = [
  'chat-completions-create',
  'responses-create',
  'images-generate',
  'images-edit',
  'messages-create',
  'gemini-generate-content',
]

export async function loadSchemaBundle(id: string): Promise<SchemaBundle> {
  if (!SCHEMA_OPERATIONS.includes(id)) {
    throw new Error(`Unknown schema operation ${id}`)
  }
  const [schema, zh, overlay] = await Promise.all([
    import(`../schemas/${id}.json`),
    import(`../schemas/${id}.zh.json`),
    import(`../schemas/${id}.overlay.json`),
  ])
  return {
    schema: schema.default as ApiSchema,
    zh: zh.default as SchemaTranslations,
    overlay: overlay.default as SchemaOverlay,
  }
}
