import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import type { Bill } from '@/features/enterprise-console/types'

import { BillArchiveControl } from '../bill-archive-control'

const apiMock = vi.hoisted(() => ({
  archiveFinanceBill: vi.fn(),
  downloadFinanceBillArchive: vi.fn(),
}))
vi.mock('../../../api', () => apiMock)
const csvMock = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock('../../../lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/csv')>()),
  saveBlob: csvMock.saveBlob,
}))

const baseBill: Bill = {
  id: 9,
  bill_no: 'B-TEST-0009',
  enterprise_id: 1,
  period_id: 1,
  bill_type: 'credit',
  period_start: 1_767_225_600,
  period_end: 1_769_904_000,
  amount_quota: 0,
  amount_usd: '0',
  adjustment_usd: '0',
  total_usd: '0',
  paid_usd: '0',
  currency: 'USD',
  status: 'unpaid',
  issued_at: 1_769_904_000,
  due_at: 0,
  paid_at: 0,
  reminder_count: 0,
  reconcile_diff_quota: 0,
  reconcile_acked_at: 0,
  reconcile_acked_by: 0,
  reconcile_ack_note: '',
  remark: '',
  archive_info: null,
  archived_at: 0,
  usage_snapshot: null,
  seller_snapshot: null,
  buyer_snapshot: null,
}

function renderControl(bill: Bill) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <BillArchiveControl bill={bill} />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  apiMock.archiveFinanceBill.mockReset()
  apiMock.downloadFinanceBillArchive.mockReset()
  csvMock.saveBlob.mockReset()
})

test('unarchived bill shows the archive button and calls the archive API on click', async () => {
  apiMock.archiveFinanceBill.mockResolvedValue({
    success: true,
    data: { bill_id: 9, archived_at: 1 },
  })
  renderControl(baseBill)
  expect(
    screen.queryByRole('button', { name: 'Statement snapshot' })
  ).not.toBeInTheDocument()

  await userEvent.click(
    screen.getByRole('button', { name: 'Archive to object storage' })
  )

  await waitFor(() =>
    expect(apiMock.archiveFinanceBill).toHaveBeenCalledWith(9)
  )
})

test('archived bill shows two download buttons and saves the statement snapshot as bill_no-statement.csv.gz', async () => {
  const blob = new Blob(['x'], { type: 'application/gzip' })
  apiMock.downloadFinanceBillArchive.mockResolvedValue(blob)
  renderControl({
    ...baseBill,
    archived_at: 1_769_990_400,
    archive_info: {
      statement: { key: 'k1', bytes: 1, sha256: 'a', rows: 1 },
      raw_logs: { key: 'k2', bytes: 1, sha256: 'b', rows: 1 },
      schema_version: 1,
      archived_at: 1_769_990_400,
    },
  })
  expect(
    screen.queryByRole('button', { name: 'Archive to object storage' })
  ).not.toBeInTheDocument()
  expect(screen.getByText(/Archived/)).toBeInTheDocument()

  await userEvent.click(
    screen.getByRole('button', { name: 'Statement snapshot' })
  )

  await waitFor(() =>
    expect(apiMock.downloadFinanceBillArchive).toHaveBeenCalledWith(
      9,
      'statement'
    )
  )
  expect(csvMock.saveBlob).toHaveBeenCalledWith(
    blob,
    'B-TEST-0009-statement.csv.gz'
  )
  expect(screen.getByRole('button', { name: 'Raw logs' })).toBeInTheDocument()
})
