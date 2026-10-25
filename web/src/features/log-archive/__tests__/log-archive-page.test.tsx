import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { LogArchivePage } from '../components/log-archive-page'
import type { LogArchiveManifest } from '../types'

const apiMock = vi.hoisted(() => ({
  getLogArchiveStatus: vi.fn(),
  listLogArchiveManifests: vi.fn(),
  retryLogArchiveDay: vi.fn(),
}))
vi.mock('../api', () => apiMock)

function manifest(
  partial: Partial<LogArchiveManifest> & { day: string }
): LogArchiveManifest {
  return {
    status: 'purged',
    parts: 1,
    total_rows: 10,
    row_count: 10,
    min_id: 1,
    max_id: 10,
    sum_quota: 0,
    object_key: `local/logs/${partial.day}.csv.gz`,
    bytes: 2048,
    sha256: 'x'.repeat(64),
    schema_version: 1,
    last_error: '',
    purged_rows: 10,
    purged_at: 1_700_000_000,
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
    ...partial,
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <LogArchivePage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  apiMock.getLogArchiveStatus.mockResolvedValue({
    success: true,
    data: {
      status: {
        enabled: true,
        configured_days: 90,
        effective_days: 90,
        run_at: '03:00',
        store_configured: true,
        bucket: 'tokenfunc-logs',
        prefix: 'prod',
        rollup_cursor: '2026-10-24',
        cutoff_day: '2026-07-27',
        last_run_at: 1_700_000_000,
        last_result: {
          cutoff_day: '2026-07-27',
          days_archived: 1,
          days_purged: 1,
          rows_archived: 10,
          rows_deleted: 10,
          stopped_reason: 'reached cutoff',
          guarded_users: 0,
        },
        last_error: '',
        protected_types: [1, 3, 6],
        max_days_per_run: 30,
        batch_limit: 2000,
        batch_pause_ms: 200,
      },
      summary: {
        pending_days: 1,
        verified_days: 0,
        purged_days: 1,
        purged_rows: 10,
        max_purged_day: '2026-03-10',
        row_mismatch_days: 0,
      },
    },
  })
  apiMock.listLogArchiveManifests.mockResolvedValue({
    success: true,
    data: {
      page: 1,
      page_size: 30,
      total: 2,
      items: [
        manifest({
          day: '2026-03-11',
          status: 'pending',
          object_key: '',
          bytes: 0,
          purged_rows: 0,
          last_error: 'cos down',
        }),
        manifest({ day: '2026-03-10' }),
      ],
    },
  })
  apiMock.retryLogArchiveDay.mockResolvedValue({
    success: true,
    data: manifest({ day: '2026-03-11' }),
  })
})

afterEach(() => {
  cleanup()
  apiMock.getLogArchiveStatus.mockReset()
  apiMock.listLogArchiveManifests.mockReset()
  apiMock.retryLogArchiveDay.mockReset()
})

test('shows retention status, pending warning and one row per archived day', async () => {
  renderPage()
  expect(await screen.findByText('tokenfunc-logs/prod')).toBeInTheDocument()
  expect(screen.getByText('2026-07-27')).toBeInTheDocument()
  expect(screen.getByText('cos down')).toBeInTheDocument()
  expect(screen.getByText('local/logs/2026-03-10.csv.gz')).toBeInTheDocument()
  expect(screen.getByText('2.0 KB')).toBeInTheDocument()
  // 测试环境 i18next 无资源，key 原样返回但仍做插值
  expect(screen.getByText(/1 days are pending/)).toBeInTheDocument()
  expect(apiMock.listLogArchiveManifests).toHaveBeenCalledWith({
    p: 1,
    page_size: 30,
  })
})

test('retry is offered only for non-purged days and calls the API after confirmation', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('cos down')
  const retryButtons = screen.getAllByRole('button', { name: 'Retry archive' })
  expect(retryButtons).toHaveLength(1)
  await user.click(retryButtons[0])
  const dialog = await screen.findByRole('alertdialog')
  await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
  await waitFor(() =>
    expect(apiMock.retryLogArchiveDay).toHaveBeenCalledWith('2026-03-11')
  )
})
