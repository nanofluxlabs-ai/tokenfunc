import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { Bill, BillUsageSnapshotV2 } from '../../types'
import { BillDetailContent } from '../bill-detail-page'

vi.mock('../../api', () => ({ downloadBillCsv: vi.fn() }))

const baseBill: Bill = {
  id: 7,
  bill_no: 'TF-202610-000007',
  enterprise_id: 1,
  period_id: 3,
  bill_type: 'credit',
  period_start: 1759276800,
  period_end: 1761955200,
  amount_quota: 1_500_000,
  amount_usd: '3',
  adjustment_usd: '0',
  total_usd: '3',
  paid_usd: '1',
  currency: 'USD',
  status: 'partially_paid',
  issued_at: 1761955260,
  due_at: 1763251200,
  paid_at: 0,
  reminder_count: 0,
  reconcile_diff_quota: 0,
  archive_info: null,
  archived_at: 0,
  seller_snapshot: null,
  buyer_snapshot: null,
  remark: '',
  usage_snapshot: null,
}

const v2Snapshot: BillUsageSnapshotV2 = {
  snapshot_version: 2,
  logs_total_calls: 3,
  logs_total_quota: 1_500_000,
  by_group_model: [
    {
      group: 'default',
      group_label: 'Default',
      model_name: 'claude-opus',
      count: 3,
      prompt_tokens: 3000,
      completion_tokens: 1500,
      input_tokens: 2000,
      cached_tokens: 800,
      cache_creation_tokens: 200,
      cache_creation_1h_tokens: 0,
      quota: 1_500_000,
      amount_usd: '3.000000',
      percentage: 100,
      ratios: {
        model_ratio: { value: 2.5 },
        group_ratio: { value: 1 },
        group_ratio_exclusive: false,
        completion_ratio: { value: 5 },
        cache_ratio: { value: 0.1 },
        cache_creation_ratio: { value: 1.25 },
        cache_creation_ratio_1h: null,
        model_price: null,
      },
      unit_prices: {
        input: 5,
        cache_read: 0.5,
        cache_write_5m: 6.25,
        cache_write_1h: null,
        output: 25,
      },
    },
  ],
  by_model: [],
  by_day: [
    {
      day: '2025-10-01',
      calls: 3,
      prompt_tokens: 3000,
      input_tokens: 2000,
      cached_tokens: 800,
      cache_creation_tokens: 200,
      completion_tokens: 1500,
      quota: 1_500_000,
      amount_usd: '3.000000',
      percentage: 100,
    },
  ],
  by_team: [
    {
      key_id: 1,
      key_name: 'R&D',
      request_count: 3,
      prompt_tokens: 3000,
      completion_tokens: 1500,
      cache_tokens: 800,
      cache_creation_tokens: 200,
      quota: 1_500_000,
    },
  ],
  by_member: [],
}

describe('BillDetailContent', () => {
  test('v1 snapshot shows the legacy notice, a model table without prices, and - for missing cache columns', () => {
    render(
      <BillDetailContent
        bill={{
          ...baseBill,
          usage_snapshot: {
            by_model: [
              {
                key_id: 0,
                key_name: 'gpt-4o',
                request_count: 3,
                prompt_tokens: 3000,
                completion_tokens: 1500,
                quota: 1_500_000,
              },
            ],
            by_department: [],
          },
        }}
      />
    )
    expect(
      screen.getByText(/issued before unit prices were snapshotted/)
    ).toBeInTheDocument()
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.queryByText('Input price')).not.toBeInTheDocument()
    expect(screen.queryByText('Summary by day')).not.toBeInTheDocument()
    const modelRow = screen.getByText('gpt-4o').closest('tr')
    expect(modelRow).not.toBeNull()
    expect(modelRow?.textContent).toContain('-')
  })

  test('v2 snapshot renders the token group table with unit price headers and the daily table', () => {
    render(
      <BillDetailContent bill={{ ...baseBill, usage_snapshot: v2Snapshot }} />
    )
    expect(screen.getByText('Summary by token group')).toBeInTheDocument()
    expect(screen.getByText('Input price')).toBeInTheDocument()
    expect(screen.getByText('Output price')).toBeInTheDocument()
    expect(screen.getByText('Summary by day')).toBeInTheDocument()
    expect(screen.getByText('2025-10-01')).toBeInTheDocument()
    expect(screen.getByText('R&D')).toBeInTheDocument()
    expect(
      screen.queryByText(/may differ from the billed amount/)
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Export CSV' })
    ).toBeInTheDocument()
  })

  test('v2 snapshot whose log total differs from the billed amount shows the in-flight notice', () => {
    render(
      <BillDetailContent
        bill={{
          ...baseBill,
          amount_quota: 1_600_000,
          usage_snapshot: v2Snapshot,
        }}
      />
    )
    expect(
      screen.getByText(/may differ from the billed amount/)
    ).toBeInTheDocument()
  })
})
