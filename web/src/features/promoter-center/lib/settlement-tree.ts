import type { PromoterSettlementMonth, PromoterSettlementUser } from '../types'

/** 树形行：月份行可展开到该月每个绑定用户 */
export type SettlementTreeRow =
  | {
      id: string
      kind: 'month'
      month: PromoterSettlementMonth
      children: SettlementTreeRow[]
    }
  | {
      id: string
      kind: 'user'
      month: PromoterSettlementMonth
      user: PromoterSettlementUser
      children?: undefined
    }

/** 月份 → 用户子行 */
export function buildSettlementTree(
  items: PromoterSettlementMonth[]
): SettlementTreeRow[] {
  return items.map((month) => ({
    id: month.month,
    kind: 'month',
    month,
    children: month.users.map((user) => ({
      id: `${month.month}:${user.user_id}`,
      kind: 'user',
      month,
      user,
    })),
  }))
}
