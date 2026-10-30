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
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'

import { DocContent } from './components/doc-content'
import { DocsLayout } from './components/docs-layout'
import { DocsSampleBar } from './components/docs-sample-bar'
import {
  DOCS_API_KEY_PLACEHOLDER,
  useDocsVariables,
} from './hooks/use-docs-variables'
import { parseDoc } from './lib/doc-markdown'
import { loadDocSource } from './lib/doc-source'
import { docsLangSearch } from './lib/docs-links'
import { maskApiKey } from './lib/sample-keys'
import {
  DOCS_DEFAULT_SLUG,
  docsLangFromUiLanguage,
  getDocsEntry,
  resolveDocSlug,
  type DocsLang,
} from './registry'

function DocsSkeleton() {
  return (
    <div className='space-y-3' aria-hidden>
      <div className='bg-muted/40 h-4 w-2/3 animate-pulse rounded' />
      <div className='bg-muted/40 h-4 w-full animate-pulse rounded' />
      <div className='bg-muted/40 h-4 w-5/6 animate-pulse rounded' />
      <div className='bg-muted/30 h-24 w-full animate-pulse rounded-lg' />
      <div className='bg-muted/40 h-4 w-1/2 animate-pulse rounded' />
    </div>
  )
}

function DocsPageView(props: { slug: string; lang: DocsLang }) {
  const entry = getDocsEntry(props.slug)
  const copyVars = useDocsVariables(entry.model)
  // 页面上显示打码后的密钥，复制按钮仍复制真实密钥
  const vars = useMemo(
    () =>
      copyVars.apiKey === DOCS_API_KEY_PLACEHOLDER
        ? copyVars
        : { ...copyVars, apiKey: maskApiKey(copyVars.apiKey) },
    [copyVars]
  )
  const source = useQuery({
    queryKey: ['docs-source', props.lang, props.slug],
    queryFn: () => loadDocSource(props.lang, props.slug),
    staleTime: Infinity,
  })
  const parsed = useMemo(
    () => (source.data ? parseDoc(source.data, props.lang) : null),
    [source.data, props.lang]
  )

  const title = entry.title[props.lang]
  const siteName = vars.siteName
  useEffect(() => {
    const previous = document.title
    document.title = `${title} - ${siteName}`
    return () => {
      document.title = previous
    }
  }, [title, siteName])

  // API 页（有请求示例）把模型选择放在请求示例上方，顶部不再放示例参数卡片
  const isApiPage = Boolean(parsed?.aside.length)
  let body = <DocsSkeleton />
  if (parsed) {
    body = (
      <DocContent
        blocks={parsed.blocks}
        vars={vars}
        copyVars={copyVars}
        sampleFamily={entry.model}
      />
    )
  } else if (source.isError) {
    body = <ErrorState onRetry={() => source.refetch()} />
  }

  return (
    <DocsLayout
      slug={entry.slug}
      lang={props.lang}
      headings={parsed?.headings ?? []}
      toolbar={
        parsed && !isApiPage ? (
          <DocsSampleBar family={entry.model} />
        ) : undefined
      }
      aside={
        parsed && isApiPage ? (
          <DocContent
            blocks={parsed.aside}
            vars={vars}
            copyVars={copyVars}
            placement='aside'
            sampleFamily={entry.model}
          />
        ) : undefined
      }
    >
      {body}
    </DocsLayout>
  )
}

/**
 * 正文语言跟随站点导航里的界面语言；地址上的 ?lang 随之同步，
 * 让分享出去的链接和搜索引擎看到的地址与正文语言一致。
 */
function useDocsLang(urlLang: DocsLang | undefined): DocsLang {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = docsLangFromUiLanguage(i18n.resolvedLanguage || i18n.language)
  const expected = docsLangSearch(lang).lang
  useEffect(() => {
    if (urlLang === expected) return
    void navigate({
      to: '.',
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        lang: expected,
      }),
      replace: true,
    })
  }, [urlLang, expected, navigate])
  return lang
}

export function DocsLandingPage() {
  const search = useSearch({ from: '/docs/' })
  const lang = useDocsLang(search.lang)
  return <DocsPageView slug={DOCS_DEFAULT_SLUG} lang={lang} />
}

export function DocsRoutePage() {
  const params = useParams({ from: '/docs/$slug' })
  const search = useSearch({ from: '/docs/$slug' })
  const lang = useDocsLang(search.lang)
  return <DocsPageView slug={resolveDocSlug(params.slug)} lang={lang} />
}
