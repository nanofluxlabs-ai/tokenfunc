import { PAYMENT_METHODS } from '@/features/finance/constants'

import { TOPUP_SOURCES } from '../constants'
import type { TopupSource } from '../types'

/** 带符号的美元金额：后端给 "-30.000000" 时显示 "-$30.000000" */
export function formatSignedUsd(amountUsd: string): string {
  if (amountUsd.startsWith('-')) return `-$${amountUsd.slice(1)}`
  return `$${amountUsd}`
}

/**
 * 支付方式展示：后端在线充值给 "provider/method"（如 epay/alipay），逐段映射到订单中心的支付方式文案；
 * 未登记的值原样显示；空值显示 "-"
 */
export function paymentMethodLabel(
  method: string,
  t: (key: string) => string
): string {
  if (!method) return '-'
  return method
    .split('/')
    .map((part) => {
      const config = PAYMENT_METHODS[part]
      return config ? t(config.labelKey) : part
    })
    .join(' / ')
}

export function isTopupSource(value: unknown): value is TopupSource {
  return typeof value === 'string' && value in TOPUP_SOURCES
}
