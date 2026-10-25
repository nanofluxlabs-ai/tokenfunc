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
import { useParams } from '@tanstack/react-router'
import { lazy, type ComponentType } from 'react'

import { DocsLayout } from './components/docs-layout'
import { DOCS_DEFAULT_SLUG, resolveDocSlug } from './registry'

/**
 * Lazy content page per slug. The registry (used by the sidebar and tests)
 * stays free of these imports so each content page lands in its own chunk.
 */
const DOC_PAGE_COMPONENTS: Record<string, ComponentType> = {
  'quick-start': lazy(() => import('./content/quick-start')),
  'api-authentication': lazy(() => import('./content/api-authentication')),
  'api-models': lazy(() => import('./content/api-models')),
  'api-chat-completions': lazy(() => import('./content/api-chat-completions')),
  'api-messages': lazy(() => import('./content/api-messages')),
  'api-responses': lazy(() => import('./content/api-responses')),
  'api-images': lazy(() => import('./content/api-images')),
  'api-errors': lazy(() => import('./content/api-errors')),
  'tools-claude-code': lazy(() => import('./content/tools-claude-code')),
  'tools-codex': lazy(() => import('./content/tools-codex')),
  'tools-openclaw': lazy(() => import('./content/tools-openclaw')),
  'tools-pi': lazy(() => import('./content/tools-pi')),
  'tools-workbuddy': lazy(() => import('./content/tools-workbuddy')),
  'tools-hermes': lazy(() => import('./content/tools-hermes')),
  'tools-openai-client': lazy(() => import('./content/tools-openai-client')),
  'enterprise-integration': lazy(
    () => import('./content/enterprise-integration')
  ),
}

function DocsPageView(props: { slug: string }) {
  const Page =
    DOC_PAGE_COMPONENTS[props.slug] ?? DOC_PAGE_COMPONENTS[DOCS_DEFAULT_SLUG]
  return (
    <DocsLayout slug={props.slug}>
      <Page />
    </DocsLayout>
  )
}

/** /docs — renders the default docs page (quick start). */
export function DocsLandingPage() {
  return <DocsPageView slug={DOCS_DEFAULT_SLUG} />
}

/** /docs/$slug — renders the registry page for the resolved slug. */
export function DocsRoutePage() {
  const params = useParams({ from: '/docs/$slug' })
  const slug = resolveDocSlug(params.slug)
  return <DocsPageView slug={slug} />
}
