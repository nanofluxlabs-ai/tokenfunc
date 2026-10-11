import { describe, expect, test } from 'vitest'

import {
  buildQuoteStandaloneHtml,
  QUOTE_PRINT_THEME,
  quoteFileName,
  renderQuoteMarkdownToHtml,
} from '../quote-export'

describe('quote export', () => {
  test('markdown tables keep <br/> line breaks inside cells', () => {
    const html = renderQuoteMarkdownToHtml(
      '| 模型 | 输入 |\n|---|---|\n| **gpt-5** | 官方 $5.00 / **$2.50**<br/>¥34.25 / **¥17.12** |\n'
    )
    expect(html).toContain('<table>')
    expect(html).toContain('<br>')
    expect(html).toContain('<strong>gpt-5</strong>')
  })

  test('script tags in markdown are stripped before export', () => {
    const html = renderQuoteMarkdownToHtml('hi <script>alert(1)</script>')
    expect(html).not.toContain('<script')
  })

  test('standalone html has an empty title, landscape page and brand colors', () => {
    const html = buildQuoteStandaloneHtml('<h1>Quote</h1>')
    expect(html).toContain('<title></title>')
    expect(html).toContain('size: A4 landscape')
    expect(html).toContain(QUOTE_PRINT_THEME.brand)
    expect(html).toContain('<h1>Quote</h1>')
  })

  test('file name is slugified from the brand name', () => {
    expect(quoteFileName('TokenFunc', '2026-10-11', 'md')).toBe(
      'tokenfunc-pricing-2026-10-11.md'
    )
    expect(quoteFileName('  ', '2026-10-11', 'html')).toBe(
      'quote-pricing-2026-10-11.html'
    )
  })
})
