import { describe, expect, it } from 'vitest'

import { reconciliationSearchSchema } from '../../search-schema'

describe('reconciliationSearchSchema', () => {
  it('keeps a valid tab, date range, page and source', () => {
    expect(
      reconciliationSearchSchema.parse({
        tab: 'topup',
        start: '2026-10-01',
        end: '2026-10-31',
        page: 2,
        source: 'online',
      })
    ).toEqual({
      tab: 'topup',
      start: '2026-10-01',
      end: '2026-10-31',
      page: 2,
      source: 'online',
    })
  })

  it('drops an unknown tab, malformed dates and non-positive pages instead of failing', () => {
    expect(
      reconciliationSearchSchema.parse({
        tab: 'bills',
        start: '2026/10/01',
        end: 'yesterday',
        page: 0,
      })
    ).toEqual({})
  })
})
