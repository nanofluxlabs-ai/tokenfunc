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
})
