import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getKeyEmployeeInfo,
  getKeyUsageLogs,
  type KeyUsageError,
  normalizeApiKey,
} from '../api'

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('key usage api', () => {
  it('sends only the pasted key, without cookies, and keeps it out of the URL', async () => {
    const fetchMock = mockFetch(200, {
      success: true,
      data: { items: [], total: 0, page: 2, page_size: 20 },
    })
    await getKeyUsageLogs('sk-abc', {
      page: 2,
      pageSize: 20,
      startTimestamp: 100,
      endTimestamp: 200,
      model: 'gpt-a',
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe(
      '/api/key-usage/logs?p=2&page_size=20&start_timestamp=100&end_timestamp=200&model_name=gpt-a'
    )
    expect(url).not.toContain('sk-abc')
    expect(init.credentials).toBe('omit')
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-abc' })
  })

  it('treats 403 from the employee endpoint as a non-employee key', async () => {
    mockFetch(403, { error: { code: 'access_denied' } })
    await expect(getKeyEmployeeInfo('sk-abc')).resolves.toBeNull()
  })

  it('surfaces 401 as an invalid key error', async () => {
    mockFetch(401, { success: false })
    await expect(
      getKeyUsageLogs('sk-bad', {
        page: 1,
        pageSize: 20,
        startTimestamp: 0,
        endTimestamp: 1,
      })
    ).rejects.toMatchObject({ status: 401 } satisfies Partial<KeyUsageError>)
  })

  it('normalizes pasted keys', () => {
    expect(normalizeApiKey('  Bearer sk-abc \n')).toBe('sk-abc')
  })
})
