import type { PromoterCenterTab } from './types'

export const PROMOTER_QUERY_KEY = 'promoter'

export const PROMOTER_CENTER_TABS: PromoterCenterTab[] = [
  'daily',
  'users',
  'models',
]

export const PROMOTER_CENTER_TAB_TITLE_KEYS: Record<PromoterCenterTab, string> =
  {
    daily: 'Daily consumption',
    users: 'User consumption',
    models: 'Model consumption',
  }

/** 名下用户 / 模型表本地分页每页行数 */
export const PROMOTER_CENTER_PAGE_SIZE = 20
