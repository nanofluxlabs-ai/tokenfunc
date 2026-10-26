import { describe, expect, it } from 'vitest'

import { usageRequest } from '../api'

const range = { ts_start: 1_700_000_000, ts_end: 1_700_086_400 }

describe('usageRequest picks the finance endpoint by scope', () => {
  it('sends admin requests to the finance center with user_id and bill_id', () => {
    const req = usageRequest(
      { scope: 'admin', user_id: 7, bill_id: 42, ...range },
      '/usage/detail'
    )
    expect(req.url).toBe('/api/admin/finance/usage/detail')
    expect(req.query).toEqual({ ...range, user_id: 7, bill_id: 42 })
  })

  it('sends enterprise requests to the enterprise console without user_id', () => {
    const req = usageRequest(
      { scope: 'enterprise', bill_id: 42, ...range },
      '/usage/summary'
    )
    expect(req.url).toBe('/api/enterprise/finance/usage/summary')
    expect(req.query).toEqual({ ...range, bill_id: 42 })
  })

  it('sends self requests to the personal endpoint with only the range', () => {
    const req = usageRequest({ scope: 'self', ...range }, '/usage/daily')
    expect(req.url).toBe('/api/user/finance/usage/daily')
    expect(req.query).toEqual(range)
  })
})
