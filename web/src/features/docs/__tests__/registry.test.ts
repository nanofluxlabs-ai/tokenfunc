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
import { describe, expect, it } from 'vitest'

import {
  DOCS_DEFAULT_SLUG,
  DOCS_GROUPS,
  DOCS_PAGES,
  DOCS_SLUGS,
  getDocsEntry,
  getDocsNav,
  getPagerNeighbors,
  resolveDocSlug,
} from '../registry'

describe('docs registry', () => {
  it('has unique slugs across all pages', () => {
    expect(new Set(DOCS_SLUGS).size).toBe(DOCS_SLUGS.length)
  })

  it('assigns every page to a known group', () => {
    const groupIds = new Set(DOCS_GROUPS.map((group) => group.id))
    for (const page of DOCS_PAGES) {
      expect(groupIds.has(page.group), page.slug).toBe(true)
    }
  })

  it('keeps the default slug registered and resolvable', () => {
    expect(DOCS_SLUGS).toContain(DOCS_DEFAULT_SLUG)
    expect(getDocsEntry(DOCS_DEFAULT_SLUG).slug).toBe(DOCS_DEFAULT_SLUG)
  })

  it('resolves valid slugs unchanged and falls back for anything else', () => {
    expect(resolveDocSlug('api-models')).toBe('api-models')
    expect(resolveDocSlug('tools-claude-code')).toBe('tools-claude-code')
    expect(resolveDocSlug('nope')).toBe(DOCS_DEFAULT_SLUG)
    expect(resolveDocSlug(undefined)).toBe(DOCS_DEFAULT_SLUG)
    expect(resolveDocSlug('')).toBe(DOCS_DEFAULT_SLUG)
  })

  it('getDocsEntry falls back to the default entry for unknown slugs', () => {
    expect(getDocsEntry('garbage').slug).toBe(DOCS_DEFAULT_SLUG)
  })

  it('covers every page exactly once in the navigation', () => {
    const nav = getDocsNav()
    expect(nav.map((group) => group.id)).toEqual(
      DOCS_GROUPS.map((group) => group.id)
    )
    const navSlugs = nav.flatMap((group) =>
      group.pages.map((page) => page.slug)
    )
    expect([...navSlugs].sort()).toEqual([...DOCS_SLUGS].sort())
  })

  it('provides no prev for the first page and no next for the last page', () => {
    expect(getPagerNeighbors(DOCS_SLUGS[0]).prev).toBeUndefined()
    expect(getPagerNeighbors(DOCS_SLUGS[0]).next?.slug).toBe(DOCS_SLUGS[1])

    const lastIndex = DOCS_SLUGS.length - 1
    expect(getPagerNeighbors(DOCS_SLUGS[lastIndex]).next).toBeUndefined()
    expect(getPagerNeighbors(DOCS_SLUGS[lastIndex]).prev?.slug).toBe(
      DOCS_SLUGS[lastIndex - 1]
    )
  })

  it('resolves unknown slugs to the default page before paging', () => {
    const neighbors = getPagerNeighbors('garbage')
    expect(neighbors.prev).toBeUndefined()
    expect(neighbors.next?.slug).toBe(DOCS_SLUGS[1])
  })
})
