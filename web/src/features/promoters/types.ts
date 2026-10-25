import type {
  ApiResponse,
  PromoterCenterRange,
  PromoterCenterUser,
  PromoterProfile,
} from '@/features/promoter-center/types'

export type { ApiResponse, PromoterCenterUser, PromoterProfile }

/** 管理员推广人列表一行：档案 + 用户摘要 + 绑定数 + 本月净消耗 */
export interface PromoterListItem extends PromoterProfile {
  email: string
  deleted: boolean
  bound_user_count: number
  month_net_quota: number
}

export interface PagedData<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}

export interface PromoterBoundUser {
  id: number
  username: string
  display_name: string
  role: number
}

export interface PromoterBindFailure {
  input: string
  reason_key: string
  reason_params?: Record<string, unknown>
}

export interface PromoterBindResult {
  bound: PromoterBoundUser[]
  failed: PromoterBindFailure[]
}

export interface PromoterBindingsResponse {
  range: PromoterCenterRange
  items: PromoterCenterUser[]
}

export type PromotersDialogType = 'create' | 'edit' | 'bindings' | 'remove'

/** 添加 / 编辑推广人共用的可编辑字段 */
export interface PromoterEditableFields {
  remark: string
  share_rate: number
}

/** 用户选择器选中的用户摘要 */
export interface PickedUser {
  id: number
  username: string
  display_name: string
  role: number
}
