import type { FinanceDisplayCurrency, FinanceOrder } from '../types'

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CNY: '¥',
  CUSTOM: '¤',
}

/** 金额加币种符号，保留两位；未知币种用代码前缀 */
export function formatMoney(
  amount: number,
  currency: FinanceDisplayCurrency | string
): string {
  const symbol = CURRENCY_SYMBOLS[currency]
  const text = amount.toFixed(2)
  return symbol ? `${symbol}${text}` : `${currency} ${text}`
}

/** 订单金额：美元为主显示，原币种不是美元时括号附原币金额，例如 "$200.00 (¥1380.00)" */
export function formatOrderAmount(
  order: Pick<FinanceOrder, 'amount' | 'usd_amount' | 'currency'>
): string {
  const usd = formatMoney(order.usd_amount, 'USD')
  if (order.currency === 'USD') return usd
  return `${usd} (${formatMoney(order.amount, order.currency)})`
}
