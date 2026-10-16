import type { StatusBadgeProps } from '@/components/status-badge'

export const FINANCE_QUERY_KEY = 'admin-finance'

export const FINANCE_PAGE_SIZE = 20

/** 模型消费树表每页展示的分组数（本地分页） */
export const MODEL_GROUP_PAGE_SIZE = 20

export const ORDER_TYPES: Record<string, { labelKey: string }> = {
  wallet_topup: { labelKey: 'Wallet top-up' },
  subscription_purchase: { labelKey: 'Subscription purchase' },
}

export const ORDER_STATUSES: Record<
  string,
  { labelKey: string; variant: StatusBadgeProps['variant'] }
> = {
  success: { labelKey: 'success', variant: 'success' },
  pending: { labelKey: 'pending', variant: 'warning' },
  failed: { labelKey: 'failed', variant: 'danger' },
  expired: { labelKey: 'expired', variant: 'danger' },
}

/** 订单中心筛选用的支付方式选项；值同时匹配 payment_method 与 payment_provider */
export const PAYMENT_METHODS: Record<string, { labelKey: string }> = {
  stripe: { labelKey: 'Stripe' },
  creem: { labelKey: 'Creem' },
  alipay: { labelKey: 'Alipay' },
  wxpay: { labelKey: 'WeChat Pay' },
  waffo: { labelKey: 'Waffo' },
  waffo_pancake: { labelKey: 'Waffo Pancake' },
  balance: { labelKey: 'Balance' },
  epay: { labelKey: 'Epay' },
  // 管理员手动充值：provider 为 admin，method 为实际收款方式
  admin: { labelKey: 'Admin top-up' },
  bank_transfer: { labelKey: 'Bank transfer' },
  gift: { labelKey: 'Gift' },
}

export const ENTERPRISE_BILLING_MODE_TAGS: Record<
  string,
  { labelKey: string; variant: StatusBadgeProps['variant'] }
> = {
  credit: { labelKey: 'Credit period', variant: 'info' },
  prepaid: { labelKey: 'Prepaid', variant: 'neutral' },
}
