import z from 'zod'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** YYYY-MM-DD；非法值按未提供处理 */
export const dateParam = z
  .string()
  .regex(DATE_PATTERN)
  .optional()
  .catch(undefined)

export const textParam = z.string().optional().catch(undefined)
export const pageParam = z.number().int().positive().optional().catch(undefined)

/**
 * /finance/$section 的 search：各 tab 的键用前缀区分，切换 tab 不互相清理。
 * start / end 为页头日期范围，经营看板、订单中心、用户消耗、模型消费共用；uc* 用户消耗；mc* 模型消费。
 */
export const financeSectionSearchSchema = z.object({
  start: dateParam,
  end: dateParam,
  // 订单中心
  page: pageParam,
  pageSize: pageParam,
  q: textParam,
  username: textParam,
  orderType: textParam,
  status: textParam,
  payMethod: textParam,
  // 用户消耗
  ucPage: pageParam,
  ucPageSize: pageParam,
  ucQ: textParam,
  // 模型消费
  mcModel: textParam,
  mcUser: textParam,
  mcGroup: textParam,
})

export type FinanceSectionSearch = z.infer<typeof financeSectionSearchSchema>

/** /finance/users/$userId 的 search */
export const financeUserSearchSchema = z.object({
  start: dateParam,
  end: dateParam,
  page: pageParam,
  username: textParam,
})

export type FinanceUserSearch = z.infer<typeof financeUserSearchSchema>
