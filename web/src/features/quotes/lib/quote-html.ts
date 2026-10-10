import type { TFunction } from 'i18next'

import type { Quote } from '../types'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function money(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, '') : '—'
}

function dateOf(timestamp: number): string {
  return timestamp ? new Date(timestamp * 1000).toISOString().slice(0, 10) : '—'
}

/** 自包含的报价单 HTML，用于新窗口打印另存为 PDF */
export function buildQuoteHtml(quote: Quote, t: TFunction): string {
  const seller = quote.seller_snapshot
  const items = quote.items ?? []
  const rows = items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.vendor_name)}</td>
        <td><b>${escapeHtml(item.model_name)}</b>${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ''}</td>
        <td class="num muted">${money(item.input_usd)} / ${money(item.output_usd)}</td>
        <td class="num">${item.discount_percent ? `${money(item.discount_percent)}%` : '—'}</td>
        <td class="num"><b>${money(item.quoted_input_usd)}</b></td>
        <td class="num"><b>${money(item.quoted_output_usd)}</b></td>
        <td class="num">${item.cache_usd > 0 ? `<b>${money(item.quoted_cache_usd)}</b>` : '—'}</td>
      </tr>`
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(t('Quotation'))} ${escapeHtml(quote.quote_no)}</title>
<style>
  body{font-family:-apple-system,"PingFang SC","Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans CJK SC",sans-serif;color:#111;margin:40px auto;max-width:900px;font-size:13px;line-height:1.5}
  h1{font-size:26px;margin:0 0 4px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px}
  .meta{text-align:right}.meta div{margin-bottom:2px}
  .parties{display:flex;gap:40px;margin:20px 0}.parties section{flex:1}.parties h4{margin:0 0 6px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f6f6f6;font-size:12px}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.muted{color:#777;font-size:12px}
  .notes{margin-top:20px;white-space:pre-wrap}footer{margin-top:32px;color:#777;font-size:11px;border-top:1px solid #ddd;padding-top:8px}
  @media print{body{margin:0}@page{margin:16mm}}
</style></head><body>
<div class="head">
  <div>${seller?.logo_url ? `<img src="${escapeHtml(seller.logo_url)}" alt="" style="max-height:40px;margin-bottom:8px"/><br/>` : ''}<h1>${escapeHtml(t('Quotation'))}</h1><div class="muted">${escapeHtml(quote.quote_no)}</div></div>
  <div class="meta">
    <div><b>${escapeHtml(t('Date'))}:</b> ${dateOf(quote.created_at)}</div>
    <div><b>${escapeHtml(t('Valid until'))}:</b> ${quote.valid_until ? dateOf(quote.valid_until) : escapeHtml(t('Until further notice'))}</div>
    <div><b>${escapeHtml(t('Currency'))}:</b> ${escapeHtml(quote.currency)} / 1M tokens</div>
  </div>
</div>
<div class="parties">
  <section><h4>${escapeHtml(t('From'))}</h4><b>${escapeHtml(seller?.company_name)}</b><br/>${escapeHtml(seller?.address)}<br/>${escapeHtml(seller?.email)}${seller?.phone ? ` · ${escapeHtml(seller.phone)}` : ''}</section>
  <section><h4>${escapeHtml(t('Prepared for'))}</h4><b>${escapeHtml(quote.customer_name)}</b><br/>${escapeHtml(quote.customer_contact)}${quote.customer_email ? ` · ${escapeHtml(quote.customer_email)}` : ''}</section>
</div>
<table><thead><tr>
  <th>${escapeHtml(t('Vendor'))}</th><th>${escapeHtml(t('Model'))}</th>
  <th class="num">${escapeHtml(t('List price (in / out)'))}</th><th class="num">${escapeHtml(t('Discount'))}</th>
  <th class="num">${escapeHtml(t('Input'))}</th><th class="num">${escapeHtml(t('Output'))}</th><th class="num">${escapeHtml(t('Cached input'))}</th>
</tr></thead><tbody>${rows}</tbody></table>
${quote.notes ? `<div class="notes">${escapeHtml(quote.notes)}</div>` : ''}
<footer>${escapeHtml(seller?.footer_notes)}</footer>
</body></html>`
}

export function openQuotePrintWindow(quote: Quote, t: TFunction): boolean {
  const popup = window.open('', '_blank', 'width=1000,height=1000')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildQuoteHtml(quote, t))
  popup.document.close()
  popup.focus()
  popup.addEventListener('load', () => popup.print())
  return true
}
