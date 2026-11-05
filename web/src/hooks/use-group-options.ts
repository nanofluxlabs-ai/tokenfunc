// TokenFunc 二开：各处分组下拉的统一数据源，选项已按后台排序值排好。
// 用户编辑 / 企业主账号 / 订阅升级 / 财务用户消耗 用 useUserGroupOptions；
// 渠道编辑 / 财务模型消费与账单 / 使用日志筛选 用 useChannelGroupOptions（管理员）；
// 令牌分组 / 游乐场分组 用 useSelfChannelGroupOptions（登录用户）。
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  requireServerSuccess,
  translateServerText,
} from '@/lib/server-error-message'
import {
  listChannelGroups,
  listSelfChannelGroups,
  listUserGroups,
  tokenFuncGroupQueryKeys,
  type UserGroupKind,
} from '@/lib/tokenfunc-groups'

export type GroupOption = {
  value: string
  /** 展示名称；没有登记名称时就是 key */
  label: string
  key: string
  order: number
}

export type UserGroupOption = GroupOption & {
  kind: UserGroupKind
  description: string
  userCount: number
}

export type ChannelGroupOption = GroupOption & {
  ratio: number | null
  /** auto 是令牌的自动分组，不是真实的池 */
  auto: boolean
}

const STALE_TIME = 5 * 60 * 1000

export function useUserGroupOptions(options?: { enabled?: boolean }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: tokenFuncGroupQueryKeys.user,
    queryFn: async () => requireServerSuccess(await listUserGroups()),
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME,
  })
  const items = useMemo<UserGroupOption[]>(
    () =>
      (query.data?.data ?? []).map((item) => ({
        value: item.key,
        key: item.key,
        label: translateServerText(t, item.label),
        order: item.order,
        kind: item.kind,
        description: item.description,
        userCount: item.user_count,
      })),
    [query.data, t]
  )
  return { ...query, options: items }
}

export function useChannelGroupOptions(options?: { enabled?: boolean }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: tokenFuncGroupQueryKeys.channel,
    queryFn: async () => requireServerSuccess(await listChannelGroups()),
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME,
  })
  const items = useMemo<ChannelGroupOption[]>(
    () =>
      (query.data?.data ?? []).map((item) => ({
        value: item.key,
        key: item.key,
        label: translateServerText(t, item.label),
        order: item.order,
        ratio: item.ratio,
        auto: item.key === 'auto',
      })),
    [query.data, t]
  )
  return { ...query, options: items }
}

export function useSelfChannelGroupOptions(options?: {
  enabled?: boolean
  staleTime?: number
}) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: tokenFuncGroupQueryKeys.self,
    queryFn: async () => requireServerSuccess(await listSelfChannelGroups()),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? STALE_TIME,
  })
  const items = useMemo<ChannelGroupOption[]>(
    () =>
      (query.data?.data?.groups ?? []).map((item) => ({
        value: item.key,
        key: item.key,
        label: translateServerText(t, item.label),
        order: item.order,
        ratio: item.ratio,
        auto: item.auto,
      })),
    [query.data, t]
  )
  return {
    ...query,
    options: items,
    userGroup: query.data?.data?.user_group ?? '',
    defaultGroup: query.data?.data?.default_group ?? '',
  }
}

/** 单选下拉里的展示文案：名称与 key 不同时括注 key，方便运营对照 */
export function userGroupOptionLabel(option: GroupOption): string {
  const label = option.label || option.key
  return label === option.key ? label : `${label} (${option.key})`
}
