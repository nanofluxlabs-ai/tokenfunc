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
// tokenfunc 二开：Anthropic 没有公开 OpenAPI 文件，官方 API 参考的 Markdown 版（platform.claude.com/docs/en/api/*.md）
// 是按缩进嵌套的字段列表：`- \`名称: [optional] 类型\`` 为字段，`- \`类型名 object\`` 等为「多选一」的类型，
// 其下的段落为说明，`default: x` / `minimum: x` 等为约束。这里把它解析成文档字段树。
import type {
  SchemaField,
  SchemaNode,
} from '../../src/features/docs/lib/api-schema'
import type { BuiltSchema } from './openapi'

type MdItem = {
  indent: number
  head: string
  lines: string[]
  children: MdItem[]
}

const LIST_ITEM = /^(\s*)- (.*)$/
const PURE_ITEM = /^`([^`]+)`$/
const FIELD_HEAD = /^([A-Za-z_$][\w.$-]*): (optional )?(.+)$/
const CONSTRAINT =
  /^(default|minimum|maximum|minLength|maxLength|minItems|maxItems|pattern|format): /
const SCALARS = new Set(['string', 'number', 'integer', 'boolean', 'unknown'])

/** 取出 `## 标题` 下某个 `### 小节` 的正文行 */
function sectionLines(markdown: string, title: string, sub: string): string[] {
  const lines = markdown.split('\n')
  const start = lines.indexOf(`## ${title}`)
  if (start < 0) throw new Error(`Section "## ${title}" not found`)
  const subStart = lines.indexOf(`### ${sub}`, start)
  if (subStart < 0) throw new Error(`"### ${sub}" not found under ${title}`)
  const end = lines.findIndex(
    (line, index) => index > subStart && /^#{2,3} /.test(line)
  )
  return lines.slice(subStart + 1, end < 0 ? undefined : end)
}

/** 按缩进把列表还原成树；非纯代码的列表项和段落都归到最近的上级条目作为说明 */
function parseItems(lines: string[]): MdItem[] {
  const root: MdItem = { indent: -1, head: '', lines: [], children: [] }
  const stack: MdItem[] = [root]
  const top = () => stack.at(-1) ?? root
  for (const line of lines) {
    if (!line.trim()) {
      top().lines.push('')
      continue
    }
    const indent = line.length - line.trimStart().length
    const item = line.match(LIST_ITEM)
    const pure = item?.[2].match(PURE_ITEM)
    while (stack.length > 1 && top().indent >= indent) stack.pop()
    if (item && pure) {
      const next: MdItem = { indent, head: pure[1], lines: [], children: [] }
      top().children.push(next)
      stack.push(next)
      continue
    }
    top().lines.push(line.trim())
  }
  return root.children
}

function cleanLink(text: string): string {
  return text.replaceAll('?sdk_languages=http', '')
}

/** 约束行：`default: 0, minimum: 0` 这类逗号分隔的键值，默认值单独取出，其余留在说明里 */
function describe(item: MdItem): { description?: string; default?: unknown } {
  const kept: string[] = []
  let defaultValue: unknown
  for (const line of item.lines) {
    if (!CONSTRAINT.test(line)) {
      kept.push(line)
      continue
    }
    const others: string[] = []
    for (const part of line.split(', ')) {
      if (part.startsWith('default: ')) {
        defaultValue = part.slice('default: '.length)
      } else {
        others.push(part)
      }
    }
    if (others.length) kept.push(others.join(', '))
  }
  const description = cleanLink(kept.join('\n'))
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
  const meta: { description?: string; default?: unknown } = {}
  if (description) meta.description = description
  if (defaultValue !== undefined) meta.default = defaultValue
  return meta
}

function isLiteral(head: string): boolean {
  return /^(".*"|-?\d+(\.\d+)?|true|false|null)$/.test(head)
}

function literalValue(text: string): unknown {
  return text.startsWith('"') ? text.slice(1, -1) : JSON.parse(text)
}

const NAMED_TYPE = /^[A-Z]\w*$/

/** 文档末尾 Domain types 章节里的具名类型：`### 标题` 下第一项是 `Name object` 或 `Name = 类型` */
function domainTypes(markdown: string): Map<string, MdItem> {
  const types = new Map<string, MdItem>()
  const lines = markdown.split('\n')
  lines.forEach((line, index) => {
    if (!line.startsWith('### ')) return
    const end = lines.findIndex(
      (next, at) => at > index && /^#{2,3} /.test(next)
    )
    const [first] = parseItems(
      lines.slice(index + 1, end < 0 ? undefined : end)
    )
    const name = first?.head.match(/^(\w+)(?: object| = .+)$/)?.[1]
    if (first && name && !types.has(name)) types.set(name, first)
  })
  return types
}

class AnthropicNormalizer {
  readonly defs: Record<string, SchemaNode> = {}

  constructor(private readonly types: Map<string, MdItem>) {}

  field(item: MdItem): SchemaField | undefined {
    const match = item.head.match(FIELD_HEAD)
    if (!match) return undefined
    return {
      name: match[1],
      required: !match[2],
      node: this.node(match[3], item),
    }
  }

  private fields(item: MdItem): SchemaField[] {
    return item.children
      .map((child) => this.field(child))
      .filter((field): field is SchemaField => Boolean(field))
  }

  /** 只写了类型名、没有就地展开的，引用 Domain types 里的定义 */
  private named(name: string): SchemaNode | undefined {
    const item = this.types.get(name)
    if (!item) return undefined
    if (!(name in this.defs)) {
      this.defs[name] = { kind: 'scalar', type: 'object' }
      this.defs[name] = this.variant(item)
    }
    return { kind: 'ref', ref: name }
  }

  private scalar(typeText: string, item: MdItem): SchemaNode {
    // 取值多时类型会缩写成 `"a" or "b" or 2 more`，以下面逐行列出的取值为准
    const listed = item.children.filter((child) => isLiteral(child.head))
    const parts = typeText.split(' or ')
    if (listed.length || parts.every(isLiteral)) {
      const values = (
        listed.length ? listed.map((child) => child.head) : parts
      ).map(literalValue)
      return { kind: 'scalar', type: typeof values[0], enum: values }
    }
    if (typeText.startsWith('array of ')) {
      return { kind: 'array', items: this.scalar(typeText.slice(9), item) }
    }
    if (SCALARS.has(typeText)) return { kind: 'scalar', type: typeText }
    if (NAMED_TYPE.test(typeText)) {
      const ref = this.named(typeText)
      if (ref) return ref
    }
    return {
      kind: 'scalar',
      type: typeText.startsWith('map[') ? 'map' : 'object',
    }
  }

  /** 「多选一」里的一个类型：`Name object`、`Name = 类型` 或直接是类型（string、array of X） */
  variant(item: MdItem): SchemaNode {
    let title: string | undefined
    let typeText = item.head
    const named = item.head.match(/^(\w+) = (.+)$/)
    if (named) {
      title = named[1]
      typeText = named[2]
    } else if (item.head.endsWith(' object')) {
      title = item.head.slice(0, -' object'.length)
      typeText = 'object'
    }
    const node = this.node(typeText, item)
    return title ? { ...node, title } : node
  }

  node(typeText: string, item: MdItem): SchemaNode {
    let text = typeText.trim()
    const nullable = text.endsWith(' or null')
    if (nullable) text = text.slice(0, -' or null'.length)
    const fields = this.fields(item)
    const variants = item.children.filter(
      (child) => !FIELD_HEAD.test(child.head) && !isLiteral(child.head)
    )
    let node: SchemaNode
    if (variants.length) {
      node = {
        kind: 'union',
        variants: variants.map((child) => this.variant(child)),
      }
    } else if (fields.length) {
      node = { kind: 'object', fields }
    } else {
      node = this.scalar(text, item)
    }
    // `array of X` 下面直接列出 X 的字段或可选类型时，外面再包一层数组
    if (text.startsWith('array of ') && (variants.length || fields.length)) {
      node = { kind: 'array', items: node }
    }
    const result = { ...node, ...describe(item) } as SchemaNode
    return nullable ? { ...result, nullable: true } : result
  }
}

export function buildFromAnthropicMarkdown(
  markdown: string,
  sectionTitle: string
): BuiltSchema {
  const normalizer = new AnthropicNormalizer(domainTypes(markdown))
  const body = parseItems(
    sectionLines(markdown, sectionTitle, 'Body parameters')
  )
  const [returned] = parseItems(sectionLines(markdown, sectionTitle, 'Returns'))
  if (!returned) throw new Error(`${sectionTitle} has no return type`)
  return {
    request: {
      kind: 'object',
      fields: body
        .map((item) => normalizer.field(item))
        .filter((field): field is SchemaField => Boolean(field)),
    },
    response: normalizer.variant(returned),
    defs: normalizer.defs,
  }
}
