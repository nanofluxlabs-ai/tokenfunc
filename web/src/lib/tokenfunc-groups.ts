// TokenFunc 二开：用户分组 / 渠道分组注册表与用户分组定价的接口封装。
// 用户分组 = 谁在用（default / vip / 企业档位），渠道分组 = 走哪个池、什么基准价。
import { api } from '@/lib/api'

export type ApiEnvelope<T> = {
  success: boolean
  message?: string
  data?: T
}

export const USER_GROUP_KINDS = ['individual', 'enterprise'] as const
export type UserGroupKind = (typeof USER_GROUP_KINDS)[number]

/** 用户分组注册表的一行（管理员） */
export type UserGroupItem = {
  key: string
  label: string
  description: string
  kind: UserGroupKind
  order: number
  user_count: number
  /** 与基准不同的格数：倍率覆盖 + 可见差异 */
  override_count: number
}

/** 渠道分组的一行（管理员），key 以 GroupRatio 为准 */
export type ChannelGroupItem = {
  key: string
  label: string
  order: number
  ratio: number
  topup_ratio: number
  default_visible: boolean
}

/** 某用户分组视角下的一个渠道分组 */
export type UserGroupPricingRow = {
  channel_group: string
  label: string
  base_ratio: number
  default_visible: boolean
  visible: boolean
  /** 倍率覆盖；null 表示继承基准价 */
  ratio: number | null
  effective_ratio: number
  /** 用户分组 key 本身就是这个渠道分组，上游总会把它算作可见 */
  locked: boolean
}

export type UserGroupPricingInput = {
  channel_group: string
  visible: boolean
  ratio: number | null
}

/** 登录用户可选的渠道分组，已按后台排序 */
export type SelfChannelGroupItem = {
  key: string
  label: string
  ratio: number | null
  order: number
  auto: boolean
}

export type SelfChannelGroups = {
  user_group: string
  default_group: string
  groups: SelfChannelGroupItem[]
}

export type UserGroupPayload = {
  key?: string
  label: string
  description: string
  kind: UserGroupKind
}

const BASE = '/api/tokenfunc/groups'

export async function listChannelGroups(): Promise<
  ApiEnvelope<ChannelGroupItem[]>
> {
  const res = await api.get(`${BASE}/channel`)
  return res.data
}

export async function listUserGroups(): Promise<ApiEnvelope<UserGroupItem[]>> {
  const res = await api.get(`${BASE}/user`)
  return res.data
}

export async function createUserGroup(
  payload: UserGroupPayload
): Promise<ApiEnvelope<null>> {
  const res = await api.post(`${BASE}/user`, payload)
  return res.data
}

export async function updateUserGroup(
  key: string,
  payload: UserGroupPayload
): Promise<ApiEnvelope<null>> {
  const res = await api.put(`${BASE}/user/${encodeURIComponent(key)}`, payload)
  return res.data
}

export async function deleteUserGroup(key: string): Promise<ApiEnvelope<null>> {
  const res = await api.delete(`${BASE}/user/${encodeURIComponent(key)}`)
  return res.data
}

export async function reorderUserGroups(
  keys: string[]
): Promise<ApiEnvelope<null>> {
  const res = await api.put(`${BASE}/user-order`, { keys })
  return res.data
}

export async function getUserGroupPricing(
  key: string
): Promise<ApiEnvelope<UserGroupPricingRow[]>> {
  const res = await api.get(`${BASE}/user/${encodeURIComponent(key)}/pricing`)
  return res.data
}

export async function saveUserGroupPricing(
  key: string,
  rows: UserGroupPricingInput[]
): Promise<ApiEnvelope<UserGroupPricingRow[]>> {
  const res = await api.put(`${BASE}/user/${encodeURIComponent(key)}/pricing`, {
    rows,
  })
  return res.data
}

export async function listSelfChannelGroups(): Promise<
  ApiEnvelope<SelfChannelGroups>
> {
  const res = await api.get(`${BASE}/self`)
  return res.data
}

/** React Query 缓存键：改动注册表后统一失效 */
export const tokenFuncGroupQueryKeys = {
  all: ['tokenfunc-groups'] as const,
  channel: ['tokenfunc-groups', 'channel'] as const,
  user: ['tokenfunc-groups', 'user'] as const,
  userPricing: (key: string) =>
    ['tokenfunc-groups', 'user', key, 'pricing'] as const,
  self: ['tokenfunc-groups', 'self'] as const,
}
