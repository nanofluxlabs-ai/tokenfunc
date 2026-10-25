import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { DailyTab } from '../components/daily-tab'

// jsdom 下不渲染真实图表
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: false }),
}))

afterEach(() => cleanup())

test('daily table lists the most recent day first while the input stays ascending', () => {
  render(
    <DailyTab
      daily={[
        {
          day: '2026-03-10',
          net_quota: 100,
          request_count: 1,
          prompt_tokens: 1,
          completion_tokens: 1,
        },
        {
          day: '2026-03-11',
          net_quota: 200,
          request_count: 2,
          prompt_tokens: 2,
          completion_tokens: 2,
        },
        {
          day: '2026-03-12',
          net_quota: 300,
          request_count: 3,
          prompt_tokens: 3,
          completion_tokens: 3,
        },
      ]}
    />
  )
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
  expect(
    rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)
  ).toEqual(['2026-03-12', '2026-03-11', '2026-03-10'])
})
