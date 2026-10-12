export type OrdersFilterValue = {
  keyword: string
  username: string
  orderType: string
  status: string
  payMethod: string
}

export const EMPTY_ORDERS_FILTER: OrdersFilterValue = {
  keyword: '',
  username: '',
  orderType: 'all',
  status: 'all',
  payMethod: 'all',
}

/** 从 URL search 还原订单筛选；缺省为「全部」 */
export function ordersFilterFromSearch(search: {
  q?: string
  username?: string
  orderType?: string
  status?: string
  payMethod?: string
}): OrdersFilterValue {
  return {
    keyword: search.q ?? '',
    username: search.username ?? '',
    orderType: search.orderType ?? 'all',
    status: search.status ?? 'all',
    payMethod: search.payMethod ?? 'all',
  }
}

/** 订单筛选 → URL search 片段；「全部」与空串不写入 URL，null 表示清空 */
export function ordersFilterToSearch(value: OrdersFilterValue | null) {
  return {
    q: value?.keyword || undefined,
    username: value?.username || undefined,
    orderType: value && value.orderType !== 'all' ? value.orderType : undefined,
    status: value && value.status !== 'all' ? value.status : undefined,
    payMethod: value && value.payMethod !== 'all' ? value.payMethod : undefined,
  }
}
