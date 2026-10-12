import { describe, expect, it } from 'vitest'

import {
  EMPTY_ORDERS_FILTER,
  ordersFilterFromSearch,
  ordersFilterToSearch,
} from '../orders-filter'

describe('orders filter ↔ URL search', () => {
  it('reads "all" for missing selects and empty strings for missing text', () => {
    expect(ordersFilterFromSearch({})).toEqual(EMPTY_ORDERS_FILTER)
    expect(ordersFilterFromSearch({ q: 'ABC', status: 'success' })).toEqual({
      ...EMPTY_ORDERS_FILTER,
      keyword: 'ABC',
      status: 'success',
    })
  })

  it('omits "all" and empty values from the URL and clears everything for null', () => {
    expect(
      ordersFilterToSearch({
        keyword: 'ABC',
        username: '',
        orderType: 'all',
        status: 'pending',
        payMethod: 'stripe',
      })
    ).toEqual({
      q: 'ABC',
      username: undefined,
      orderType: undefined,
      status: 'pending',
      payMethod: 'stripe',
    })
    expect(ordersFilterToSearch(null)).toEqual({
      q: undefined,
      username: undefined,
      orderType: undefined,
      status: undefined,
      payMethod: undefined,
    })
  })
})
