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
// tokenfunc 二开：文档正文的 Markdown 解析。浏览器渲染与构建期 SEO 预渲染共用本模块，
// 因此只能依赖 marked 与相对路径，不能引用 @/ 别名或 React。
import { Marked, type Token, type Tokens } from 'marked'

export type DocsLang = 'zh' | 'en'

export type CalloutTone = 'tip' | 'note' | 'warning'

export type DocBlock =
  | { kind: 'html'; html: string }
  | { kind: 'code'; code: string; lang: string; title?: string }
  | { kind: 'tabs'; tabs: { label: string; blocks: DocBlock[] }[] }
  | { kind: 'steps'; steps: { title: string; blocks: DocBlock[] }[] }
  | { kind: 'callout'; tone: CalloutTone; blocks: DocBlock[] }
  | { kind: 'widget'; name: string; attrs: Record<string, string> }

export type DocHeading = { id: string; text: string; level: 2 | 3 }

export type ParsedDoc = { blocks: DocBlock[]; headings: DocHeading[] }

/** 正文可用的交互组件名（:::名称），由 components/doc-widgets.tsx 渲染，测试据此校验没有写错 */
export const DOC_WIDGET_NAMES = [
  'cc-switch',
  'base-url',
  'contact-sales',
  'self-check',
]

/** 截图占位：图片地址以 todo: 开头时渲染为虚线框，等运营补图后换成 /docs-assets/ 下的真实路径 */
export const SCREENSHOT_PLACEHOLDER_PREFIX = 'todo:'

const CALLOUT_TONES: CalloutTone[] = ['tip', 'note', 'warning']
const DIRECTIVE_OPEN = /^:::([a-z][\w-]*)(?:\{(.*)\})?\s*$/
const DIRECTIVE_CLOSE = /^:::\s*$/
const FENCE = /^\s*(`{3,}|~{3,})/
const TAB_MARKER = /^@tab\s+(.+?)\s*$/
const STEP_MARKER = /^###\s+(.+?)\s*$/
const VARIABLE = /\{\{\s*([\w:.-]+)\s*\}\}/g
const ENCODED_VARIABLE = /%7B%7B([\w:.-]+)%7D%7D/gi

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseAttrs(raw: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const match of (raw ?? '').matchAll(/([\w-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

/**
 * 逐行扫描并回调「顶层」的行：跳过围栏代码块与嵌套指令内部，
 * 让 :::、@tab、### 这些标记只在当前层级生效。
 */
function walkTopLevel(
  lines: string[],
  visit: (line: string, index: number, topLevel: boolean) => void
): void {
  let fence: string | null = null
  let depth = 0
  lines.forEach((line, index) => {
    const fenceMatch = line.match(FENCE)
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = null
      }
      visit(line, index, false)
      return
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      visit(line, index, depth === 0)
      return
    }
    const wasTopLevel = depth === 0
    if (DIRECTIVE_OPEN.test(line)) depth++
    else if (DIRECTIVE_CLOSE.test(line)) depth = Math.max(depth - 1, 0)
    visit(line, index, wasTopLevel)
  })
}

type Segment =
  | { type: 'markdown'; lines: string[] }
  | {
      type: 'directive'
      name: string
      attrs: Record<string, string>
      body: string[]
    }

function splitDirectives(lines: string[]): Segment[] {
  const segments: Segment[] = []
  let markdown: string[] = []
  let open: {
    name: string
    attrs: Record<string, string>
    start: number
  } | null = null
  let fence: string | null = null
  let depth = 0

  lines.forEach((line, index) => {
    const fenceMatch = line.match(FENCE)
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = null
      }
      if (!open) markdown.push(line)
      return
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      if (!open) markdown.push(line)
      return
    }
    const openMatch = line.match(DIRECTIVE_OPEN)
    if (openMatch) {
      if (depth === 0) {
        if (markdown.length) {
          segments.push({ type: 'markdown', lines: markdown })
        }
        markdown = []
        open = {
          name: openMatch[1],
          attrs: parseAttrs(openMatch[2]),
          start: index,
        }
      }
      depth++
      return
    }
    if (DIRECTIVE_CLOSE.test(line) && depth > 0) {
      depth--
      if (depth === 0 && open) {
        segments.push({
          type: 'directive',
          name: open.name,
          attrs: open.attrs,
          body: lines.slice(open.start + 1, index),
        })
        open = null
      }
      return
    }
    if (!open) markdown.push(line)
  })

  if (open) {
    throw new Error(`Unclosed :::${(open as { name: string }).name} directive`)
  }
  if (markdown.length) segments.push({ type: 'markdown', lines: markdown })
  return segments
}

/** 按顶层标记行把指令体切成若干段，标记之前的内容丢弃（只允许空行） */
function splitByMarker(
  lines: string[],
  marker: RegExp,
  directive: string
): { label: string; lines: string[] }[] {
  const parts: { label: string; lines: string[] }[] = []
  walkTopLevel(lines, (line, _index, topLevel) => {
    const match = topLevel ? line.match(marker) : null
    if (match) {
      parts.push({ label: match[1], lines: [] })
      return
    }
    const current = parts.at(-1)
    if (current) {
      current.lines.push(line)
      return
    }
    if (line.trim()) {
      throw new Error(`Content before the first marker in :::${directive}`)
    }
  })
  return parts
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
    .replaceAll(/^-+|-+$/g, '')
}

function parseCodeInfo(info: string | undefined): {
  lang: string
  title?: string
} {
  const value = (info ?? '').trim()
  const lang = value.split(/\s+/)[0] || 'text'
  const title = value.match(/title="([^"]*)"/)?.[1]
  return { lang, title }
}

type ParseContext = {
  marked: Marked
  headings: DocHeading[]
}

function createMarked(lang: DocsLang, headings: DocHeading[]): Marked {
  const usedIds = new Map<string, number>()
  const marked = new Marked({ gfm: true })
  marked.use({
    renderer: {
      heading(token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens)
        const text = token.text
        if (token.depth !== 2 && token.depth !== 3) {
          return `<h${token.depth}>${inner}</h${token.depth}>\n`
        }
        const base = slugifyHeading(text) || 'section'
        const count = usedIds.get(base) ?? 0
        usedIds.set(base, count + 1)
        const id = count ? `${base}-${count + 1}` : base
        headings.push({ id, text, level: token.depth })
        return `<h${token.depth} id="${id}"><a class="docs-anchor" href="#${id}">${inner}</a></h${token.depth}>\n`
      },
      image(token: Tokens.Image) {
        const alt = escapeHtml(token.text)
        if (token.href.startsWith(SCREENSHOT_PLACEHOLDER_PREFIX)) {
          const file = escapeHtml(
            token.href.slice(SCREENSHOT_PLACEHOLDER_PREFIX.length)
          )
          return `<span class="docs-shot-placeholder" role="img" aria-label="${alt}"><span class="docs-shot-label">${lang === 'zh' ? '截图待补充' : 'Screenshot pending'}</span><span class="docs-shot-alt">${alt}</span><span class="docs-shot-file">${file}</span></span>`
        }
        return `<img class="docs-shot" src="${escapeHtml(token.href)}" alt="${alt}" loading="lazy" />`
      },
      link(token: Tokens.Link) {
        const inner = this.parser.parseInline(token.tokens)
        let href = token.href
        if (
          href.startsWith('/docs/') &&
          lang === 'en' &&
          !href.includes('lang=')
        ) {
          const [path, hash] = href.split('#')
          href = `${path}${path.includes('?') ? '&' : '?'}lang=en${hash ? `#${hash}` : ''}`
        }
        const external = /^https?:\/\//.test(href) && !href.includes('{{')
        const attrs = external
          ? ' target="_blank" rel="noopener noreferrer"'
          : ''
        return `<a href="${escapeHtml(href)}"${attrs}>${inner}</a>`
      },
      // 正文不允许内嵌 HTML，原样转义
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text)
      },
      table(token: Tokens.Table) {
        const head = token.header
          .map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`)
          .join('')
        const body = token.rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`
          )
          .join('')
        return `<div class="docs-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`
      },
    },
  })
  return marked
}

function parseMarkdown(lines: string[], ctx: ParseContext): DocBlock[] {
  const blocks: DocBlock[] = []
  const tokens = ctx.marked.lexer(lines.join('\n'))
  let pending: Token[] = []
  const flush = () => {
    if (!pending.length) return
    const list = Object.assign(pending, { links: tokens.links })
    const html = ctx.marked.parser(list)
    if (html.trim()) blocks.push({ kind: 'html', html })
    pending = []
  }
  for (const token of tokens) {
    if (token.type === 'code') {
      flush()
      const info = parseCodeInfo((token as Tokens.Code).lang)
      blocks.push({ kind: 'code', code: (token as Tokens.Code).text, ...info })
      continue
    }
    pending.push(token)
  }
  flush()
  return blocks
}

function parseBlocks(lines: string[], ctx: ParseContext): DocBlock[] {
  const blocks: DocBlock[] = []
  for (const segment of splitDirectives(lines)) {
    if (segment.type === 'markdown') {
      blocks.push(...parseMarkdown(segment.lines, ctx))
      continue
    }
    if (segment.name === 'tabs') {
      const tabs = splitByMarker(segment.body, TAB_MARKER, 'tabs').map(
        (part) => ({
          label: part.label,
          blocks: parseBlocks(part.lines, ctx),
        })
      )
      blocks.push({ kind: 'tabs', tabs })
      continue
    }
    if (segment.name === 'steps') {
      // 步骤标题不进页内目录，单独解析避免占用标题锚点
      const steps = splitByMarker(segment.body, STEP_MARKER, 'steps').map(
        (part) => ({
          title: part.label,
          blocks: parseBlocks(part.lines, ctx),
        })
      )
      blocks.push({ kind: 'steps', steps })
      continue
    }
    if ((CALLOUT_TONES as string[]).includes(segment.name)) {
      blocks.push({
        kind: 'callout',
        tone: segment.name as CalloutTone,
        blocks: parseBlocks(segment.body, ctx),
      })
      continue
    }
    if (segment.body.some((line) => line.trim())) {
      throw new Error(`Widget :::${segment.name} must not have a body`)
    }
    blocks.push({ kind: 'widget', name: segment.name, attrs: segment.attrs })
  }
  return blocks
}

/** 解析文档正文；结果与变量取值无关，可按 (语言, 正文) 缓存 */
export function parseDoc(source: string, lang: DocsLang): ParsedDoc {
  const headings: DocHeading[] = []
  const ctx: ParseContext = { marked: createMarked(lang, headings), headings }
  const blocks = parseBlocks(source.replaceAll('\r\n', '\n').split('\n'), ctx)
  return { blocks, headings }
}

/** 列出正文用到的全部 {{变量}}，供测试校验没有拼错的变量名 */
export function listDocVariables(source: string): string[] {
  return [...new Set([...source.matchAll(VARIABLE)].map((match) => match[1]))]
}

/**
 * 替换 {{变量}}：代码块按原文替换，HTML 片段先转义再替换；
 * 未知变量保持原样，方便在页面上一眼看出写错的变量名。
 */
export function fillDocVariables(
  text: string,
  vars: Record<string, string>,
  mode: 'text' | 'html'
): string {
  const replace = (whole: string, name: string) => {
    const value = vars[name]
    if (value === undefined) return whole
    return mode === 'html' ? escapeHtml(value) : value
  }
  const filled = text.replaceAll(VARIABLE, replace)
  return mode === 'html' ? filled.replaceAll(ENCODED_VARIABLE, replace) : filled
}

function renderBlocksHtml(
  blocks: DocBlock[],
  vars: Record<string, string>
): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case 'html':
          return fillDocVariables(block.html, vars, 'html')
        case 'code': {
          const code = escapeHtml(fillDocVariables(block.code, vars, 'text'))
          const title = block.title
            ? `<div class="docs-code-title">${escapeHtml(block.title)}</div>`
            : ''
          return `<div class="docs-code">${title}<pre><code class="language-${escapeHtml(block.lang)}">${code}</code></pre></div>`
        }
        case 'tabs':
          return block.tabs
            .map(
              (tab) =>
                `<section class="docs-tab"><h4>${escapeHtml(tab.label)}</h4>${renderBlocksHtml(tab.blocks, vars)}</section>`
            )
            .join('')
        case 'steps':
          return `<ol class="docs-steps">${block.steps
            .map(
              (step) =>
                `<li><h3>${escapeHtml(fillDocVariables(step.title, vars, 'text'))}</h3>${renderBlocksHtml(step.blocks, vars)}</li>`
            )
            .join('')}</ol>`
        case 'callout':
          return `<aside class="docs-callout docs-callout-${block.tone}">${renderBlocksHtml(block.blocks, vars)}</aside>`
        case 'widget':
          // 交互组件在静态页里省略，只保留接口地址这类对读者有用的文字
          return block.name === 'base-url'
            ? `<div class="docs-code"><pre><code>${escapeHtml(vars.baseUrl ?? '')}</code></pre></div>`
            : ''
      }
      return ''
    })
    .join('\n')
}

/** 构建期 SEO 预渲染：把整页正文渲染成静态 HTML（标签页全部展开，交互组件省略） */
export function renderDocHtml(
  parsed: ParsedDoc,
  vars: Record<string, string>
): string {
  return renderBlocksHtml(parsed.blocks, vars)
}
