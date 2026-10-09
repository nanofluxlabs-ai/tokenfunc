import type { TFunction } from 'i18next'

import type { Bill, UsageSnapshotGroup } from '../types'

const QUOTA_PER_UNIT = 500000

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function usd(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function quotaToUsd(quota: number): string {
  return (quota / QUOTA_PER_UNIT).toFixed(4)
}

function dateOf(timestamp: number): string {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

function rows(
  items: UsageSnapshotGroup[] | undefined,
  t: TFunction,
  fallbackName: string
): string {
  if (!items || items.length === 0) {
    return `<tr><td colspan="4" class="muted">${escapeHtml(t('No usage'))}</td></tr>`
  }
  return items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.key_name || fallbackName)}</td><td class="num">${item.request_count}</td><td class="num">${item.prompt_tokens + item.completion_tokens}</td><td class="num">${quotaToUsd(item.quota)}</td></tr>`
    )
    .join('')
}

/**
 * 生成自包含的 Invoice / 对账单 HTML（用于新窗口打印另存为 PDF）。
 * 只读取账单上的快照，不依赖当前配置，保证历史账单可复现。
 */
export function buildInvoiceHtml(bill: Bill, t: TFunction): string {
  const seller = bill.seller_snapshot ?? null
  const buyer = bill.buyer_snapshot ?? null
  const buyerProfile = buyer?.billing_profile ?? {}
  const isStatement = bill.bill_type === 'statement'
  const snapshot = (bill.usage_snapshot ?? {}) as Record<string, unknown>
  const title = isStatement ? t('Monthly Statement') : t('Invoice')
  const outstanding = (
    Number.parseFloat(bill.total_usd) - Number.parseFloat(bill.paid_usd)
  ).toFixed(2)

  const statementBody = isStatement
    ? `<table class="summary">
        <tr><th>${escapeHtml(t('Opening balance'))}</th><td class="num">${quotaToUsd(Number(snapshot.opening_quota ?? 0))}</td></tr>
        <tr><th>${escapeHtml(t('Top-ups'))}</th><td class="num">+${quotaToUsd(Number(snapshot.topup_quota ?? 0))}</td></tr>
        <tr><th>${escapeHtml(t('Consumption'))}</th><td class="num">-${quotaToUsd(Number(snapshot.consumption_quota ?? 0))}</td></tr>
        <tr><th>${escapeHtml(t('Adjustments'))}</th><td class="num">${quotaToUsd(Number(snapshot.adjustment_quota ?? 0))}</td></tr>
        <tr class="total"><th>${escapeHtml(t('Closing balance'))}</th><td class="num">${quotaToUsd(Number(snapshot.closing_quota ?? 0))}</td></tr>
      </table>`
    : `<h3>${escapeHtml(t('Usage by model'))}</h3>
      <table class="detail"><thead><tr><th>${escapeHtml(t('Model'))}</th><th class="num">${escapeHtml(t('Requests'))}</th><th class="num">${escapeHtml(t('Tokens'))}</th><th class="num">${escapeHtml(t('Amount'))} (${escapeHtml(bill.currency)})</th></tr></thead>
      <tbody>${rows(snapshot.by_model as UsageSnapshotGroup[] | undefined, t, '—')}</tbody></table>
      <h3>${escapeHtml(t('Usage by department'))}</h3>
      <table class="detail"><thead><tr><th>${escapeHtml(t('Department'))}</th><th class="num">${escapeHtml(t('Requests'))}</th><th class="num">${escapeHtml(t('Tokens'))}</th><th class="num">${escapeHtml(t('Amount'))} (${escapeHtml(bill.currency)})</th></tr></thead>
      <tbody>${rows(snapshot.by_department as UsageSnapshotGroup[] | undefined, t, t('Unassigned'))}</tbody></table>
      <table class="summary">
        <tr><th>${escapeHtml(t('Subtotal'))}</th><td class="num">${usd(bill.amount_usd)}</td></tr>
        <tr><th>${escapeHtml(t('Adjustments'))}</th><td class="num">${usd(bill.adjustment_usd)}</td></tr>
        <tr class="total"><th>${escapeHtml(t('Total due'))} (${escapeHtml(bill.currency)})</th><td class="num">${usd(bill.total_usd)}</td></tr>
        <tr><th>${escapeHtml(t('Paid'))}</th><td class="num">${usd(bill.paid_usd)}</td></tr>
        <tr><th>${escapeHtml(t('Outstanding'))}</th><td class="num">${outstanding}</td></tr>
      </table>`

  const bank =
    seller && (seller.bank_name || seller.bank_account_no)
      ? `<section class="bank"><h3>${escapeHtml(t('Payment details'))}</h3>
        <p>${escapeHtml(t('Bank'))}: ${escapeHtml(seller.bank_name)}<br/>${escapeHtml(t('Account name'))}: ${escapeHtml(seller.bank_account_name)}<br/>${escapeHtml(t('Account number'))}: ${escapeHtml(seller.bank_account_no)}${seller.swift_code ? `<br/>SWIFT: ${escapeHtml(seller.swift_code)}` : ''}</p>
        ${seller.payment_notes ? `<p class="muted">${escapeHtml(seller.payment_notes)}</p>` : ''}</section>`
      : ''

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)} ${escapeHtml(bill.bill_no)}</title>
<style>
  body{font-family:-apple-system,"PingFang SC","Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans CJK SC",sans-serif;color:#111;margin:40px auto;max-width:800px;font-size:13px;line-height:1.5}
  h1{font-size:26px;margin:0 0 4px}h3{font-size:14px;margin:24px 0 8px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px}
  .meta{text-align:right}.meta div{margin-bottom:2px}
  .parties{display:flex;gap:40px;margin:20px 0}.parties section{flex:1}.parties h4{margin:0 0 6px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse}table.detail th,table.detail td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
  table.summary{width:50%;margin-left:auto;margin-top:16px}table.summary th{text-align:left;padding:4px 8px;font-weight:normal;color:#444}table.summary td{padding:4px 8px}
  tr.total th,tr.total td{font-weight:700;border-top:2px solid #111;font-size:15px}
  .num{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#777}.bank{margin-top:24px;background:#f6f6f6;padding:12px 16px;border-radius:6px}
  footer{margin-top:32px;color:#777;font-size:11px;border-top:1px solid #ddd;padding-top:8px}
  @media print{body{margin:0}@page{margin:18mm}}
</style></head><body>
<div class="head">
  <div>${seller?.logo_url ? `<img src="${escapeHtml(seller.logo_url)}" alt="" style="max-height:40px;margin-bottom:8px"/><br/>` : ''}<h1>${escapeHtml(title)}</h1><div class="muted">${escapeHtml(bill.bill_no)}</div></div>
  <div class="meta">
    <div><b>${escapeHtml(t('Issued'))}:</b> ${dateOf(bill.issued_at)}</div>
    ${isStatement ? '' : `<div><b>${escapeHtml(t('Due'))}:</b> ${dateOf(bill.due_at)}</div>`}
    <div><b>${escapeHtml(t('Period'))}:</b> ${dateOf(bill.period_start)} ~ ${dateOf(bill.period_end)}</div>
    <div><b>${escapeHtml(t('Status'))}:</b> ${escapeHtml(bill.status)}</div>
  </div>
</div>
<div class="parties">
  <section><h4>${escapeHtml(t('From'))}</h4><b>${escapeHtml(seller?.company_name)}</b><br/>${escapeHtml(seller?.address)}<br/>${seller?.tax_id ? `${escapeHtml(t('Tax ID'))}: ${escapeHtml(seller.tax_id)}<br/>` : ''}${escapeHtml(seller?.email)}${seller?.phone ? ` · ${escapeHtml(seller.phone)}` : ''}</section>
  <section><h4>${escapeHtml(t('Bill to'))}</h4><b>${escapeHtml(buyerProfile.company_name || buyer?.enterprise_name)}</b><br/>${escapeHtml(buyerProfile.address)}<br/>${buyerProfile.tax_id ? `${escapeHtml(t('Tax ID'))}: ${escapeHtml(buyerProfile.tax_id)}<br/>` : ''}${escapeHtml(buyer?.contact_name)}${buyerProfile.billing_email || buyer?.contact_email ? ` · ${escapeHtml(buyerProfile.billing_email || buyer?.contact_email)}` : ''}</section>
</div>
${statementBody}
${isStatement ? '' : bank}
<footer>${escapeHtml(seller?.footer_notes)}</footer>
</body></html>`
}

/** 在新窗口打开 Invoice 并调起打印（用户在打印对话框选择"另存为 PDF"） */
export function openInvoicePrintWindow(bill: Bill, t: TFunction): boolean {
  const popup = window.open('', '_blank', 'width=900,height=1000')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildInvoiceHtml(bill, t))
  popup.document.close()
  popup.focus()
  popup.addEventListener('load', () => popup.print())
  return true
}
