import type { TFunction } from 'i18next'

import {
  describeRatio,
  formatRatioValue,
  formatUnitPrice,
  hasCacheWrite1h,
} from '@/features/finance/lib/usage-breakdown'
import type {
  FinanceRatioValue,
  UsageDailyRow,
  UsageGroupModelRow,
} from '@/features/finance/types'
import { getCurrencyDisplay } from '@/lib/currency'

import { isBillSnapshotV2, type Bill, type UsageSnapshotGroup } from '../types'

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

/** quota → USD（4 位小数），换算系数跟随站点的额度展示配置 */
function quotaToUsd(quota: number): string {
  return (quota / getCurrencyDisplay().config.quotaPerUnit).toFixed(4)
}

function dateOf(timestamp: number): string {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

function num(value: number | undefined): string {
  return value == null ? '-' : String(value)
}

/** 归因块（按团队 / 按成员；v1 的按模型）：请求、四项 token、金额 */
function attributionTable(
  title: string,
  items: UsageSnapshotGroup[] | undefined,
  t: TFunction,
  fallbackName: string,
  currency: string
): string {
  const head = `<thead><tr><th>${escapeHtml(title)}</th><th class="num">${escapeHtml(t('Requests'))}</th><th class="num">${escapeHtml(t('Input tokens'))}</th><th class="num">${escapeHtml(t('Cache hits'))}</th><th class="num">${escapeHtml(t('Cache writes'))}</th><th class="num">${escapeHtml(t('Output tokens'))}</th><th class="num">${escapeHtml(t('Amount'))} (${escapeHtml(currency)})</th></tr></thead>`
  const body =
    !items || items.length === 0
      ? `<tr><td colspan="7" class="muted">${escapeHtml(t('No usage'))}</td></tr>`
      : items
          .map(
            (item) =>
              `<tr><td>${escapeHtml(item.key_name || fallbackName)}</td><td class="num">${item.request_count}</td><td class="num">${num(item.prompt_tokens)}</td><td class="num">${num(item.cache_tokens)}</td><td class="num">${num(item.cache_creation_tokens)}</td><td class="num">${num(item.completion_tokens)}</td><td class="num">${quotaToUsd(item.quota)}</td></tr>`
          )
          .join('')
  return `<table class="detail">${head}<tbody>${body}</tbody></table>`
}

/** 倍率单元格：主值；多个取值时加「*」并把取值 / 占比收进表尾注释 */
function ratioCell(
  ratio: FinanceRatioValue | null,
  rowQuota: number,
  label: string,
  notes: string[]
): string {
  const described = describeRatio(ratio, rowQuota)
  if (!described) return '-'
  if (described.shares.length <= 1) return described.text
  notes.push(
    `${label}: ${described.shares
      .map(
        (share) =>
          `${formatRatioValue(share.value)} (${share.percent.toFixed(1)}%)`
      )
      .join(', ')}`
  )
  return `${described.text}*`
}

/** v2 按模型表：四项 token + 单价（USD / 1M）+ 金额 + 模型 / 分组倍率；1h 缓存写入只在出现时拆列 */
function modelTableV2(
  rows: UsageGroupModelRow[],
  t: TFunction,
  currency: string
): string {
  const split1h = hasCacheWrite1h(rows)
  const tokenHeaders = [
    t('Input tokens'),
    t('Cache hits'),
    split1h ? t('Cache writes (5m)') : t('Cache writes'),
    ...(split1h ? [t('Cache writes (1h)')] : []),
    t('Output tokens'),
  ]
  const priceHeaders = [
    t('Input price'),
    t('Cache hit price'),
    split1h ? t('Cache write (5m) price') : t('Cache write price'),
    ...(split1h ? [t('Cache write (1h) price')] : []),
    t('Output price'),
  ]
  const head = `<thead><tr><th>${escapeHtml(t('Model'))}</th><th class="num">${escapeHtml(t('Requests'))}</th>${tokenHeaders
    .map((header) => `<th class="num">${escapeHtml(header)}</th>`)
    .join('')}${priceHeaders
    .map(
      (header) =>
        `<th class="num">${escapeHtml(header)}<br/><small>USD / 1M</small></th>`
    )
    .join(
      ''
    )}<th class="num">${escapeHtml(t('Amount'))} (${escapeHtml(currency)})</th><th>${escapeHtml(t('Model ratio'))}</th><th>${escapeHtml(t('Group ratio'))}</th></tr></thead>`
  const notes: string[] = []
  const columnCount = 5 + tokenHeaders.length + priceHeaders.length
  const body =
    rows.length === 0
      ? `<tr><td colspan="${columnCount}" class="muted">${escapeHtml(t('No usage'))}</td></tr>`
      : rows
          .map((row) => {
            const tokens = [
              row.input_tokens,
              row.cached_tokens,
              row.cache_creation_tokens - row.cache_creation_1h_tokens,
              ...(split1h ? [row.cache_creation_1h_tokens] : []),
              row.completion_tokens,
            ]
            const prices = [
              row.unit_prices.input,
              row.unit_prices.cache_read,
              row.unit_prices.cache_write_5m,
              ...(split1h ? [row.unit_prices.cache_write_1h] : []),
              row.unit_prices.output,
            ]
            const modelRatio = row.ratios.model_price
              ? `${t('Per call')} $${formatRatioValue(row.ratios.model_price.value)}`
              : ratioCell(
                  row.ratios.model_ratio,
                  row.quota,
                  `${row.model_name} · ${t('Model ratio')}`,
                  notes
                )
            const groupRatio = ratioCell(
              row.ratios.group_ratio,
              row.quota,
              `${row.model_name} · ${t('Group ratio')}`,
              notes
            )
            return `<tr><td>${escapeHtml(row.model_name)}</td><td class="num">${row.count}</td>${tokens
              .map((value) => `<td class="num">${value}</td>`)
              .join('')}${prices
              .map((value) => `<td class="num">${formatUnitPrice(value)}</td>`)
              .join(
                ''
              )}<td class="num">${usd(row.amount_usd)}</td><td>${escapeHtml(modelRatio)}</td><td>${escapeHtml(groupRatio)}</td></tr>`
          })
          .join('')
  const footnote =
    notes.length === 0
      ? ''
      : `<p class="muted small">* ${escapeHtml(t('Multiple ratio values in this period'))}: ${notes.map(escapeHtml).join('; ')}</p>`
  return `<table class="detail compact">${head}<tbody>${body}</tbody></table>${footnote}`
}

/** v2 按天表：按天之和应等于账单金额，财务据此验算 */
function dailyTable(
  rows: UsageDailyRow[],
  t: TFunction,
  currency: string
): string {
  const head = `<thead><tr><th>${escapeHtml(t('Date'))}</th><th class="num">${escapeHtml(t('Requests'))}</th><th class="num">${escapeHtml(t('Input tokens'))}</th><th class="num">${escapeHtml(t('Cache hits'))}</th><th class="num">${escapeHtml(t('Cache writes'))}</th><th class="num">${escapeHtml(t('Output tokens'))}</th><th class="num">${escapeHtml(t('Amount'))} (${escapeHtml(currency)})</th></tr></thead>`
  const body =
    rows.length === 0
      ? `<tr><td colspan="7" class="muted">${escapeHtml(t('No usage'))}</td></tr>`
      : rows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.day)}</td><td class="num">${row.calls}</td><td class="num">${row.input_tokens}</td><td class="num">${row.cached_tokens}</td><td class="num">${row.cache_creation_tokens}</td><td class="num">${row.completion_tokens}</td><td class="num">${usd(row.amount_usd)}</td></tr>`
          )
          .join('')
  return `<table class="detail">${head}<tbody>${body}</tbody></table>`
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
  const snapshot = bill.usage_snapshot ?? {}
  const title = isStatement ? t('Monthly Statement') : t('Invoice')
  const outstanding = (
    Number.parseFloat(bill.total_usd) - Number.parseFloat(bill.paid_usd)
  ).toFixed(2)

  let usageBody: string
  if (isBillSnapshotV2(snapshot)) {
    usageBody = `<h3>${escapeHtml(t('Usage by model'))}</h3>${modelTableV2(snapshot.by_model, t, bill.currency)}
      <h3>${escapeHtml(t('Usage by day'))}</h3>${dailyTable(snapshot.by_day, t, bill.currency)}`
  } else {
    usageBody = `<h3>${escapeHtml(t('Usage by model'))}</h3>${attributionTable(t('Model'), snapshot.by_model, t, '—', bill.currency)}`
  }
  usageBody += `<h3>${escapeHtml(t('Usage by team'))}</h3>${attributionTable(t('Team'), snapshot.by_team ?? snapshot.by_department, t, t('Unassigned'), bill.currency)}`

  const statementBody = isStatement
    ? `<table class="summary">
        <tr><th>${escapeHtml(t('Opening balance'))}</th><td class="num">${quotaToUsd(Number(snapshot.opening_quota ?? 0))}</td></tr>
        <tr><th>${escapeHtml(t('Top-ups'))}</th><td class="num">+${quotaToUsd(Number(snapshot.topup_quota ?? 0))}</td></tr>
        <tr><th>${escapeHtml(t('Consumption'))}</th><td class="num">-${quotaToUsd(Number(snapshot.consumption_quota ?? 0))}</td></tr>
        <tr><th>${escapeHtml(t('Adjustments'))}</th><td class="num">${quotaToUsd(Number(snapshot.adjustment_quota ?? 0))}</td></tr>
        <tr class="total"><th>${escapeHtml(t('Closing balance'))}</th><td class="num">${quotaToUsd(Number(snapshot.closing_quota ?? 0))}</td></tr>
      </table>
      ${isBillSnapshotV2(snapshot) ? usageBody : ''}`
    : `${usageBody}
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
  body{font-family:-apple-system,"PingFang SC","Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans CJK SC",sans-serif;color:#111;margin:40px auto;max-width:1000px;font-size:13px;line-height:1.5}
  h1{font-size:26px;margin:0 0 4px}h3{font-size:14px;margin:24px 0 8px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px}
  .meta{text-align:right}.meta div{margin-bottom:2px}
  .parties{display:flex;gap:40px;margin:20px 0}.parties section{flex:1}.parties h4{margin:0 0 6px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse}table.detail th,table.detail td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
  table.compact th,table.compact td{padding:4px 5px;font-size:11px}table.compact small{font-weight:normal;color:#777}
  table.summary{width:50%;margin-left:auto;margin-top:16px}table.summary th{text-align:left;padding:4px 8px;font-weight:normal;color:#444}table.summary td{padding:4px 8px}
  tr.total th,tr.total td{font-weight:700;border-top:2px solid #111;font-size:15px}
  .num{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#777}.small{font-size:11px;margin:6px 0 0}.bank{margin-top:24px;background:#f6f6f6;padding:12px 16px;border-radius:6px}
  footer{margin-top:32px;color:#777;font-size:11px;border-top:1px solid #ddd;padding-top:8px}
  @media print{body{margin:0}@page{margin:14mm;size:A4 landscape}}
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
  const popup = window.open('', '_blank', 'width=1100,height=1000')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildInvoiceHtml(bill, t))
  popup.document.close()
  popup.focus()
  popup.addEventListener('load', () => popup.print())
  return true
}
