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
// tokenfunc 二开：构建后把文档中心每一页预渲染成静态 HTML 片段，供 Go 在返回 /docs/* 时注入首屏，
// 让不执行 JS 的搜索引擎也能抓到正文。用法：bun scripts/tokenfunc-docs-prerender.ts（在 rsbuild build 之后）。
// 片段里的站点地址与站点名是占位符，由 Go 按当前部署的配置替换，白标部署无需重新构建。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  escapeHtml,
  parseDoc,
  renderDocHtml,
} from '../src/features/docs/lib/doc-markdown'
import {
  FALLBACK_MODELS,
  MODEL_FAMILIES,
} from '../src/features/docs/lib/sample-models'
import {
  DOCS_DEFAULT_LANG,
  DOCS_DEFAULT_SLUG,
  DOCS_LANGS,
  DOCS_PAGES,
  getDocsNav,
  type DocsLang,
} from '../src/features/docs/registry'

const BASE_URL_PLACEHOLDER = '__TOKENFUNC_BASE_URL__'
const SITE_NAME_PLACEHOLDER = '__TOKENFUNC_SITE_NAME__'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = path.join(webRoot, 'src/features/docs/content')
const outDir = path.join(webRoot, 'dist/docs-seo')

function pageHref(slug: string, lang: DocsLang): string {
  return lang === DOCS_DEFAULT_LANG
    ? `/docs/${slug}`
    : `/docs/${slug}?lang=${lang}`
}

function renderNav(lang: DocsLang, activeSlug: string): string {
  const groups = getDocsNav()
    .map((group) => {
      const links = group.pages
        .map((page) => {
          const current = page.slug === activeSlug ? ' aria-current="page"' : ''
          return `<li><a href="${pageHref(page.slug, lang)}"${current} class="block rounded-md px-3 py-1.5 text-sm text-muted-foreground">${escapeHtml(page.title[lang])}</a></li>`
        })
        .join('')
      return `<div><div class="text-muted-foreground/70 mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase">${escapeHtml(group.title[lang])}</div><ul class="space-y-0.5">${links}</ul></div>`
    })
    .join('')
  return `<nav class="hidden lg:block space-y-6">${groups}</nav>`
}

const vars: Record<string, string> = {
  baseUrl: BASE_URL_PLACEHOLDER,
  siteName: SITE_NAME_PLACEHOLDER,
  apiKey: 'sk-xxxxxxxxxxxxxxxx',
}
for (const family of MODEL_FAMILIES) {
  vars[`model:${family}`] = FALLBACK_MODELS[family]
}

let count = 0
for (const lang of DOCS_LANGS) {
  mkdirSync(path.join(outDir, lang), { recursive: true })
  for (const page of DOCS_PAGES) {
    const source = readFileSync(
      path.join(contentDir, lang, `${page.slug}.md`),
      'utf8'
    )
    const parsed = parseDoc(source, lang)
    const body = renderDocHtml(parsed, {
      ...vars,
      model: FALLBACK_MODELS[page.model ?? 'gpt'],
    })
    const html = [
      '<div class="container px-4 pt-24 pb-16 md:px-6" data-docs-prerender="">',
      '<div class="grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)]">',
      renderNav(lang, page.slug),
      '<article class="w-full max-w-3xl">',
      `<h1 class="text-foreground text-3xl font-bold tracking-tight">${escapeHtml(page.title[lang])}</h1>`,
      `<p class="text-muted-foreground mt-2 text-base">${escapeHtml(page.description[lang])}</p>`,
      `<div class="docs-prose mt-8">${body}</div>`,
      '</article></div></div>',
    ].join('')
    writeFileSync(path.join(outDir, lang, `${page.slug}.html`), html)
    count++
  }
}

const manifest = {
  defaultLang: DOCS_DEFAULT_LANG,
  defaultSlug: DOCS_DEFAULT_SLUG,
  langs: DOCS_LANGS,
  pages: DOCS_PAGES.map((page) => ({
    slug: page.slug,
    title: page.title,
    description: page.description,
  })),
}
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest))
process.stdout.write(
  `[docs-prerender] ${count} pages -> ${path.relative(webRoot, outDir)}\n`
)
