import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UsageDetailRow } from '../../../types'
import { UsageDetailTable } from '../usage-detail-table'

const ROW = {
  created_at: 1793000000,
  model_name: 'gpt-4o',
  token_name: 'wangwu-key',
  group: 'default',
  prompt_tokens: 1000,
  input_tokens: 1000,
  cached_tokens: 0,
  cache_creation_tokens: 0,
  cache_creation_1h_tokens: 0,
  completion_tokens: 500,
  quota: 3750,
  amount_usd: '0.0075',
  model_ratio: null,
  group_ratio: null,
} as UsageDetailRow

vi.mock('../../../hooks/use-usage-breakdown-queries', () => ({
  useUsageDetail: () => ({
    data: { items: [ROW], total: 1 },
    isLoading: false,
    isFetching: false,
  }),
}))

function setMobileViewport(mobile: boolean) {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: mobile && query === '(max-width: 640px)',
  }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('UsageDetailTable', () => {
  it('labels every token number on the mobile card instead of showing bare values', () => {
    setMobileViewport(true)
    render(<UsageDetailTable scope='enterprise' ts_start={0} ts_end={1} />)

    // 每个数字前都有字段名（截图里只有裸数字）
    for (const [label, value] of [
      ['Input tokens', '1,000'],
      ['Cache hits', '0'],
      ['Cache writes', '0'],
      ['Output tokens', '500'],
    ] as const) {
      const field = screen.getByText(label).parentElement as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }
  })

  it('puts the amount on the card header next to the time', () => {
    setMobileViewport(true)
    render(<UsageDetailTable scope='enterprise' ts_start={0} ts_end={1} />)

    const amount = screen.getByText('$0.007500')
    // 金额作为卡片徽标，不在字段网格里，也就不需要再带字段名
    expect(screen.queryByText('Amount (USD)')).toBeNull()
    expect(amount).toBeInTheDocument()
  })
})
