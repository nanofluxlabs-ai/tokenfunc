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
// 正文是运营可直接改的 Markdown，这里兜底：每页中英文都在、能解析、变量与组件名没写错、站内链接不失效
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DOC_WIDGET_NAMES,
  listDocVariables,
  parseDoc,
  type DocBlock,
} from '../lib/doc-markdown'
import {
  isPlaygroundOperation,
  PLAYGROUND_OPERATIONS,
} from '../lib/playground-spec'
import { MODEL_FAMILIES } from '../lib/sample-models'
import { DOCS_LANGS, DOCS_PAGES, DOCS_SLUGS } from '../registry'

const contentDir = path.resolve(import.meta.dirname, '../content')
const KNOWN_VARIABLES = new Set([
  'baseUrl',
  'apiKey',
  'siteName',
  'model',
  ...MODEL_FAMILIES.map((family) => `model:${family}`),
])

function readPage(lang: string, slug: string): string {
  return readFileSync(path.join(contentDir, lang, `${slug}.md`), 'utf8')
}

function collectWidgets(blocks: DocBlock[]): string[] {
  return blocks.flatMap((block) => {
    if (block.kind === 'widget') return [block.name]
    if (block.kind === 'tabs') {
      return block.tabs.flatMap((tab) => collectWidgets(tab.blocks))
    }
    if (block.kind === 'steps') {
      return block.steps.flatMap((step) => collectWidgets(step.blocks))
    }
    if (block.kind === 'callout') return collectWidgets(block.blocks)
    return []
  })
}

describe.each(DOCS_LANGS)('docs content (%s)', (lang) => {
  it('has exactly one Markdown file per registered page', () => {
    const files = readdirSync(path.join(contentDir, lang))
      .map((file) => file.replace(/\.md$/, ''))
      .sort()
    expect(files).toEqual([...DOCS_SLUGS].sort())
  })

  it.each(DOCS_PAGES.map((page) => page.slug))(
    '%s parses with known variables, widgets and links',
    (slug) => {
      const source = readPage(lang, slug)
      const parsed = parseDoc(source, lang)

      expect(parsed.blocks.length).toBeGreaterThan(0)
      expect(
        listDocVariables(source).filter((name) => !KNOWN_VARIABLES.has(name))
      ).toEqual([])
      expect(
        collectWidgets(parsed.blocks).filter(
          (name) => !DOC_WIDGET_NAMES.includes(name)
        )
      ).toEqual([])

      const docLinks = [
        ...source.matchAll(/\]\(\/docs\/([\w-]+)(?:#([^)\s]+))?\)/g),
      ]
      expect(
        docLinks.filter((match) => !DOCS_SLUGS.includes(match[1]))
      ).toEqual([])
      // 接口地址栏必须指向调试规范里存在的接口，且方法与地址一致，避免地址栏与调试弹窗对不上
      const endpoints = [
        ...source.matchAll(
          /:::endpoint\{method="([A-Z]+)" path="([^"]+)" operation="([^"]*)"\}/g
        ),
      ]
      expect(
        endpoints
          .filter((match) => {
            const op = match[3]
            if (!isPlaygroundOperation(op)) return true
            const target = PLAYGROUND_OPERATIONS[op]
            return (
              target.path !== match[2] ||
              target.method !== match[1].toLowerCase()
            )
          })
          .map((match) => match[0])
      ).toEqual([])

      // 跨页锚点必须指向目标页真实存在的小节标题
      const brokenAnchors = docLinks
        .filter((match) => match[2])
        .filter((match) => {
          const target = parseDoc(readPage(lang, match[1]), lang)
          return !target.headings.some((heading) => heading.id === match[2])
        })
        .map((match) => match[0])
      expect(brokenAnchors).toEqual([])
    }
  )
})

describe('docs screenshots', () => {
  it('points real screenshots at files that exist under public/docs-assets', () => {
    const publicDir = path.resolve(import.meta.dirname, '../../../../public')
    const missing = DOCS_LANGS.flatMap((lang) =>
      DOCS_PAGES.flatMap((page) =>
        [
          ...readPage(lang, page.slug).matchAll(
            /!\[[^\]]*\]\((\/docs-assets\/[^)\s]+)\)/g
          ),
        ]
          .map((match) => match[1])
          .filter((src) => !existsSync(path.join(publicDir, src)))
      )
    )
    expect(missing).toEqual([])
  })
})
