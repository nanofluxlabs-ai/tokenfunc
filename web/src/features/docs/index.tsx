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
import { useParams, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'

import { ErrorState } from '@/components/error-state'

import { DocContent } from './components/doc-content'
import { DocsLayout } from './components/docs-layout'
import { DocsSampleBar } from './components/docs-sample-bar'
import { useDocsVariables } from './hooks/use-docs-variables'
import { parseDoc } from './lib/doc-markdown'
import { loadDocSource } from './lib/doc-source'
import {
  DOCS_DEFAULT_SLUG,
  getDocsEntry,
  resolveDocSlug,
  resolveDocsLang,
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
  const vars = useDocsVariables(entry.model)
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
    document.documentElement.lang = props.lang === 'zh' ? 'zh-CN' : 'en'
    return () => {
      document.title = previous
    }
  }, [title, siteName, props.lang])

  let body = <DocsSkeleton />
  if (parsed) body = <DocContent blocks={parsed.blocks} vars={vars} />
  else if (source.isError) {
    body = <ErrorState onRetry={() => source.refetch()} />
  }

  return (
    <DocsLayout
      slug={entry.slug}
      lang={props.lang}
      headings={parsed?.headings ?? []}
      toolbar={<DocsSampleBar family={entry.model} />}
    >
      {body}
    </DocsLayout>
  )
}

export function DocsLandingPage() {
  const search = useSearch({ from: '/docs/' })
  return (
    <DocsPageView
      slug={DOCS_DEFAULT_SLUG}
      lang={resolveDocsLang(search.lang)}
    />
  )
}

export function DocsRoutePage() {
  const params = useParams({ from: '/docs/$slug' })
  const search = useSearch({ from: '/docs/$slug' })
  return (
    <DocsPageView
      slug={resolveDocSlug(params.slug)}
      lang={resolveDocsLang(search.lang)}
    />
  )
}
