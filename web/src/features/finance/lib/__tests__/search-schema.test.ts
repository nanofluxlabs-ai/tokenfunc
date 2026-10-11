import { describe, expect, it } from 'vitest'

import {
  financeSectionSearchSchema,
  financeUserSearchSchema,
} from '../../search-schema'

describe('finance search schemas', () => {
  it('drops malformed dates and non-positive pages instead of failing validation', () => {
    const parsed = financeSectionSearchSchema.parse({
      start: '2026-10-01',
      end: 'not-a-date',
      page: 0,
      ucPage: 3,
      q: 'abc',
    })
    expect(parsed.start).toBe('2026-10-01')
    expect(parsed.end).toBeUndefined()
    expect(parsed.page).toBeUndefined()
    expect(parsed.ucPage).toBe(3)
    expect(parsed.q).toBe('abc')
  })

  it('accepts an empty search for the user detail page', () => {
    expect(financeUserSearchSchema.parse({})).toEqual({})
    expect(
      financeUserSearchSchema.parse({
        start: '2026-01-01',
        end: '2026-01-31',
        page: 2,
      })
    ).toEqual({
      start: '2026-01-01',
      end: '2026-01-31',
      page: 2,
    })
  })
})
