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
  DOCS_PAGES,
  getDocsNav,
  getPagerNeighbors,
  resolveDocSlug,
  resolveDocsLang,
} from '../registry'

describe('docs registry', () => {
  it('uses unique slugs and gives every page and group both languages', () => {
    const slugs = DOCS_PAGES.map((page) => page.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const page of DOCS_PAGES) {
      expect(page.title.zh && page.title.en, page.slug).toBeTruthy()
      expect(page.description.zh && page.description.en, page.slug).toBeTruthy()
    }
    expect(getDocsNav().every((group) => group.pages.length > 0)).toBe(true)
  })

  it('falls back to the default page and to Chinese for unknown input', () => {
    expect(resolveDocSlug('missing')).toBe(DOCS_DEFAULT_SLUG)
    expect(resolveDocSlug(undefined)).toBe(DOCS_DEFAULT_SLUG)
    expect(resolveDocsLang('en')).toBe('en')
    expect(resolveDocsLang('fr')).toBe('zh')
    expect(resolveDocsLang(undefined)).toBe('zh')
  })

  it('pages through the sidebar order across groups', () => {
    const ordered = getDocsNav().flatMap((group) => group.pages)
    const lastGettingStarted =
      ordered.findIndex((page) => page.group === 'tools') - 1

    const neighbors = getPagerNeighbors(ordered[lastGettingStarted].slug)
    expect(neighbors.next?.group).toBe('tools')
    expect(getPagerNeighbors(ordered[0].slug).prev).toBeUndefined()
    expect(getPagerNeighbors(ordered.at(-1)?.slug ?? '').next).toBeUndefined()
  })
})
