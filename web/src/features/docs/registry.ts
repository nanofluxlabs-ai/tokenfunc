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
import type { DocsGroupId, DocsNavGroup, DocsPageEntry } from './types'

export const DOCS_GROUPS: { id: DocsGroupId; titleKey: string }[] = [
  { id: 'quick-start', titleKey: 'Quick start' },
  { id: 'model-access-api', titleKey: 'Model access API' },
  { id: 'tool-integration', titleKey: 'Third-party tool integration' },
]

export const DOCS_PAGES: DocsPageEntry[] = [
  {
    slug: 'quick-start',
    group: 'quick-start',
    titleKey: 'Quick start',
    descriptionKey:
      'Send your first model request through the gateway in minutes.',
  },
  {
    slug: 'api-authentication',
    group: 'model-access-api',
    titleKey: 'Authentication',
    descriptionKey:
      'Authenticate requests with Bearer tokens or Anthropic-style headers.',
  },
  {
    slug: 'api-models',
    group: 'model-access-api',
    titleKey: 'List models',
    descriptionKey: 'Discover which models are available to your account.',
  },
  {
    slug: 'api-chat-completions',
    group: 'model-access-api',
    titleKey: 'Chat completions',
    descriptionKey:
      'OpenAI-compatible text inference endpoint with streaming support.',
  },
  {
    slug: 'api-messages',
    group: 'model-access-api',
    titleKey: 'Anthropic messages',
    descriptionKey:
      'Anthropic Messages endpoint used by Claude Code and other agents.',
  },
  {
    slug: 'api-responses',
    group: 'model-access-api',
    titleKey: 'Responses',
    descriptionKey:
      'OpenAI Responses endpoint used by Codex and other agent tools.',
  },
  {
    slug: 'api-images',
    group: 'model-access-api',
    titleKey: 'Image generation',
    descriptionKey: 'Generate and edit images through the image endpoints.',
  },
  {
    slug: 'api-errors',
    group: 'model-access-api',
    titleKey: 'Errors',
    descriptionKey: 'Error format, status codes, and retry guidance.',
  },
  {
    slug: 'tools-claude-code',
    group: 'tool-integration',
    titleKey: 'Claude Code',
    descriptionKey:
      'Connect Claude Code to the gateway with environment variables.',
  },
  {
    slug: 'tools-codex',
    group: 'tool-integration',
    titleKey: 'Codex',
    descriptionKey: 'Connect the Codex CLI via a custom model provider.',
  },
  {
    slug: 'tools-openclaw',
    group: 'tool-integration',
    titleKey: 'OpenClaw',
    descriptionKey: 'Connect OpenClaw through a custom Anthropic provider.',
  },
  {
    slug: 'tools-pi',
    group: 'tool-integration',
    titleKey: 'Pi',
    descriptionKey: 'Connect the Pi coding agent via a custom provider entry.',
  },
  {
    slug: 'tools-workbuddy',
    group: 'tool-integration',
    titleKey: 'WorkBuddy',
    descriptionKey:
      'Connect WorkBuddy through its custom OpenAI-compatible model settings.',
  },
  {
    slug: 'tools-hermes',
    group: 'tool-integration',
    titleKey: 'Hermes',
    descriptionKey:
      'Connect the Hermes agent via a custom OpenAI-compatible endpoint.',
  },
  {
    slug: 'tools-openai-client',
    group: 'tool-integration',
    titleKey: 'OpenAI-compatible clients',
    descriptionKey:
      'Use any OpenAI-compatible SDK, CLI, or app with the gateway.',
  },
]

export const DOCS_DEFAULT_SLUG = 'quick-start'

export const DOCS_SLUGS: string[] = DOCS_PAGES.map((page) => page.slug)

export function resolveDocSlug(slug: string | undefined): string {
  return slug && DOCS_SLUGS.includes(slug) ? slug : DOCS_DEFAULT_SLUG
}

export function getDocsEntry(slug: string): DocsPageEntry {
  const resolved = resolveDocSlug(slug)
  return DOCS_PAGES.find((page) => page.slug === resolved) ?? DOCS_PAGES[0]
}

export function getDocsNav(): DocsNavGroup[] {
  return DOCS_GROUPS.map((group) => ({
    id: group.id,
    titleKey: group.titleKey,
    pages: DOCS_PAGES.filter((page) => page.group === group.id),
  }))
}

export function getPagerNeighbors(slug: string): {
  prev?: DocsPageEntry
  next?: DocsPageEntry
} {
  const index = DOCS_PAGES.findIndex(
    (page) => page.slug === resolveDocSlug(slug)
  )
  if (index === -1) return {}
  return {
    prev: index > 0 ? DOCS_PAGES[index - 1] : undefined,
    next: index < DOCS_PAGES.length - 1 ? DOCS_PAGES[index + 1] : undefined,
  }
}
