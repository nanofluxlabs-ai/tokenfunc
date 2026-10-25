import type { TFunction } from 'i18next'
import { describe, expect, test } from 'vitest'

import type { Bill } from '../../types'
import { buildInvoiceHtml } from '../invoice-html'

const t = ((key: string) => key) as unknown as TFunction

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
  reconcile_acked_at: 0,
  reconcile_acked_by: 0,
  reconcile_ack_note: '',
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
    by_department: [
      {
        key_id: 0,
        key_name: '',
        request_count: 3,
        prompt_tokens: 3000,
        completion_tokens: 1500,
        quota: 1_500_000,
      },
    ],
  },
  seller_snapshot: {
    company_name: 'TokenFunc <Ltd>',
    address: 'HK',
    tax_id: 'TF-1',
    email: 'billing@tokenfunc.com',
    phone: '',
    bank_name: 'DBS',
    bank_account_name: 'TokenFunc Ltd',
    bank_account_no: '123',
    swift_code: 'DBSSHKHH',
    payment_notes: 'Net 15',
    footer_notes: 'Thanks',
    logo_url: '',
  },
  buyer_snapshot: {
    enterprise_name: 'Acme',
    billing_profile: { company_name: 'Acme Co', tax_id: 'A-1' },
  },
  remark: '',
  archive_info: null,
  archived_at: 0,
}

describe('buildInvoiceHtml', () => {
  test('credit bill renders totals, outstanding, bank details and escapes html', () => {
    const html = buildInvoiceHtml(baseBill, t)
    expect(html).toContain('TF-202610-000007')
    expect(html).toContain('TokenFunc &lt;Ltd&gt;')
    expect(html).not.toContain('<Ltd>')
    expect(html).toContain('Acme Co')
    expect(html).toContain('>3.00<')
    expect(html).toContain('>2.00<')
    expect(html).toContain('DBSSHKHH')
    expect(html).toContain('gpt-4o')
    expect(html).toContain('Unassigned')
    expect(html).toContain('Due')
  })

  test('statement renders balance movements and omits payment details', () => {
    const statement: Bill = {
      ...baseBill,
      bill_type: 'statement',
      bill_no: 'ST-202609-000002',
      usage_snapshot: {
        opening_quota: 500000,
        topup_quota: 1000000,
        consumption_quota: 250000,
        adjustment_quota: 0,
        closing_quota: 1250000,
      },
    }
    const html = buildInvoiceHtml(statement, t)
    expect(html).toContain('Monthly Statement')
    expect(html).toContain('Opening balance')
    expect(html).toContain('1.0000')
    expect(html).toContain('2.5000')
    expect(html).not.toContain('Payment details')
    expect(html).not.toContain('Due')
  })

  test('v1 snapshot renders cache columns as - and keeps the legacy department block as team usage', () => {
    const html = buildInvoiceHtml(baseBill, t)
    expect(html).toContain('Usage by team')
    expect(html).not.toContain('Usage by day')
    expect(html).not.toContain('USD / 1M')
    // v1 行没有缓存两列：按模型行的 请求 / 输入 / 缓存命中 / 缓存写入 / 输出
    expect(html).toContain(
      '<td class="num">3</td><td class="num">3000</td><td class="num">-</td><td class="num">-</td><td class="num">1500</td>'
    )
  })

  test('v2 snapshot renders unit price columns, marks multi-value ratios with * and adds a daily table', () => {
    const v2: Bill = {
      ...baseBill,
      usage_snapshot: {
        snapshot_version: 2,
        logs_total_calls: 3,
        logs_total_quota: 1_500_000,
        by_group_model: [],
        by_model: [
          {
            group: '',
            group_label: '',
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
              model_ratio: {
                value: 2.5,
                shares: [
                  { value: 2.5, quota: 1_000_000 },
                  { value: 3, quota: 500_000 },
                ],
              },
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
      },
    }
    const html = buildInvoiceHtml(v2, t)
    expect(html).toContain('USD / 1M')
    expect(html).toContain('Input price')
    // 四项 token + 四列单价 + 金额
    expect(html).toContain(
      '<td class="num">2000</td><td class="num">800</td><td class="num">200</td><td class="num">1500</td><td class="num">5.0000</td><td class="num">0.5000</td><td class="num">6.2500</td><td class="num">25.0000</td><td class="num">3.00</td>'
    )
    expect(html).toContain('<td>2.5*</td><td>1</td>')
    expect(html).toContain(
      'Multiple ratio values in this period: claude-opus · Model ratio: 2.5 (66.7%), 3 (33.3%)'
    )
    expect(html).toContain('Usage by day')
    expect(html).toContain('<td>2025-10-01</td><td class="num">3</td>')
    expect(html).toContain('R&amp;D')
    expect(html).toContain(
      '<td class="num">3</td><td class="num">3000</td><td class="num">800</td><td class="num">200</td><td class="num">1500</td>'
    )
  })
})
