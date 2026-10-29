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
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DOCS_FALLBACK_BASE_URL,
  resolveDocsBaseUrl,
} from '../hooks/use-docs-base-url'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveDocsBaseUrl', () => {
  it('prefers server_address from the status payload', () => {
    expect(
      resolveDocsBaseUrl(
        { server_address: 'https://api.one.com', data: {} },
        'https://origin.com'
      )
    ).toBe('https://api.one.com')
  })

  it('accepts the camelCase and data-wrapped variants', () => {
    expect(
      resolveDocsBaseUrl(
        { serverAddress: 'https://api.two.com' },
        'https://origin.com'
      )
    ).toBe('https://api.two.com')
    expect(
      resolveDocsBaseUrl(
        { data: { server_address: 'https://api.three.com' } },
        'https://origin.com'
      )
    ).toBe('https://api.three.com')
    expect(
      resolveDocsBaseUrl(
        { data: { serverAddress: 'https://api.four.com' } },
        'https://origin.com'
      )
    ).toBe('https://api.four.com')
  })

  it('strips trailing slashes from the resolved address', () => {
    expect(
      resolveDocsBaseUrl(
        { server_address: 'https://api.one.com/' },
        'https://origin.com'
      )
    ).toBe('https://api.one.com')
    expect(resolveDocsBaseUrl(null, 'https://origin.com///')).toBe(
      'https://origin.com'
    )
  })

  it('skips empty-string candidates and falls back to the origin', () => {
    expect(
      resolveDocsBaseUrl({ server_address: '' }, 'https://origin.com')
    ).toBe('https://origin.com')
  })

  it('uses the current window origin when no explicit origin is given', () => {
    expect(resolveDocsBaseUrl(null)).toBe(
      window.location.origin.replace(/\/+$/, '')
    )
  })

  it('falls back to the documented placeholder without a window', () => {
    vi.stubGlobal('window', undefined)
    expect(resolveDocsBaseUrl(null)).toBe(DOCS_FALLBACK_BASE_URL)
  })

  it('treats the factory default server address as not configured', () => {
    expect(
      resolveDocsBaseUrl(
        { server_address: 'http://localhost:3000/' },
        'https://api.acme.test'
      )
    ).toBe('https://api.acme.test')
  })
})
