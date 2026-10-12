import { describe, expect, it } from 'vitest'

import { buildUsageCsvFilename, readBlobError } from '../csv'

describe('usage csv helpers', () => {
  it('builds a filename from subject, range and suffix, sanitizing path characters', () => {
    expect(
      buildUsageCsvFilename('Acme Inc', '2026-10-01', '2026-10-31', '对账单')
    ).toBe('Acme Inc-2026-10-01~2026-10-31-对账单.csv')
    expect(
      buildUsageCsvFilename('a/b:c', '2026-10-01', '2026-10-01', 'usage')
    ).toBe('a_b_c-2026-10-01~2026-10-01-usage.csv')
    expect(buildUsageCsvFilename('', '2026-10-01', '2026-10-01', 'usage')).toBe(
      'export-2026-10-01~2026-10-01-usage.csv'
    )
  })

  it('returns the server message for a JSON error blob and null for CSV content', async () => {
    const error = new Blob(
      [JSON.stringify({ success: false, message: 'too many rows' })],
      {
        type: 'application/json',
      }
    )
    expect(await readBlobError(error)).toBe('too many rows')
    const csv = new Blob(['﻿a,b\n'], { type: 'text/csv; charset=utf-8' })
    expect(await readBlobError(csv)).toBeNull()
  })
})
