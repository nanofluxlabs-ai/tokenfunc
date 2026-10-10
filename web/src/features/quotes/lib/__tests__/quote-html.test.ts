import type { TFunction } from 'i18next'
import { describe, expect, test } from 'vitest'

import type { Quote } from '../../types'
import { buildQuoteHtml } from '../quote-html'

const t = ((key: string) => key) as unknown as TFunction

describe('buildQuoteHtml', () => {
  test('renders customer, discounted prices and escapes markup', () => {
    const quote: Quote = {
      id: 1,
      quote_no: 'Q-202610-000001',
      customer_name: 'Acme <Corp>',
      customer_contact: 'Jane',
      customer_email: 'jane@acme.com',
      currency: 'USD',
      discount_percent: 10,
      valid_until: 1764547200,
      notes: 'Net 15\nPrices exclude tax',
      items: [
        {
          model_name: 'gpt-4o',
          vendor_name: 'OpenAI',
          group: 'default',
          input_usd: 2.5,
          output_usd: 10,
          cache_usd: 1.25,
          discount_percent: 10,
          quoted_input_usd: 2.25,
          quoted_output_usd: 9,
          quoted_cache_usd: 1.125,
          note: '',
        },
        {
          model_name: 'claude-sonnet-4',
          vendor_name: 'Anthropic',
          group: 'default',
          input_usd: 3,
          output_usd: 15,
          cache_usd: 0,
          discount_percent: 20,
          quoted_input_usd: 2.4,
          quoted_output_usd: 12,
          quoted_cache_usd: 0,
          note: 'volume tier',
        },
      ],
      seller_snapshot: null,
      created_by: 1,
      created_at: 1760000000,
    }
    const html = buildQuoteHtml(quote, t)
    expect(html).toContain('Acme &lt;Corp&gt;')
    expect(html).toContain('<b>2.25</b>')
    expect(html).toContain('<b>1.125</b>')
    expect(html).toContain('20%')
    expect(html).toContain('volume tier')
    expect(html).toContain('2025-12-01')
    expect(html).toContain('Prices exclude tax')
    // 无缓存价的模型显示占位符而不是 0
    expect(html).toMatch(/12<\/b><\/td>\s*<td class="num">—<\/td>/)
  })
})
