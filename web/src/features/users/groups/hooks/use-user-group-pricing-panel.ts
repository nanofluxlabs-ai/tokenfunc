// TokenFunc 二开：系统设置 › 分组定价「用户分组定价」面板的状态——选中的用户分组与它的定价草稿。
// 由页面持有并传给面板，页面右上角「保存」据此把草稿与段一一起提交。
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { requireServerSuccess } from '@/lib/server-error-message'
import { listUserGroups, tokenFuncGroupQueryKeys } from '@/lib/tokenfunc-groups'

import { useUserGroupPricing } from './use-user-group-pricing'

export function useUserGroupPricingPanel() {
  const query = useQuery({
    queryKey: tokenFuncGroupQueryKeys.user,
    queryFn: async () => requireServerSuccess(await listUserGroups()),
  })
  const groups = query.data?.data ?? []

  // 没选过或选中的分组已被删除时回落到第一项
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected =
    groups.find((group) => group.key === selectedKey) ?? groups[0]
  const groupKey = selected?.key ?? ''
  const pricing = useUserGroupPricing(groupKey)
  // 有未保存改动时切换分组先确认，这里记住想切去的分组
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  // 新建分组成功后也走同一条切换路径：当前有未保存改动时同样先确认
  const choose = (key: string) => {
    if (key === groupKey) return
    if (pricing.isDirty) {
      setPendingKey(key)
      return
    }
    setSelectedKey(key)
  }

  const discardAndSwitch = () => {
    if (pendingKey !== null) {
      pricing.reset()
      setSelectedKey(pendingKey)
    }
    setPendingKey(null)
  }

  return {
    isLoading: query.isLoading,
    groups,
    selected,
    groupKey,
    pricing,
    choose,
    pendingKey,
    cancelSwitch: () => setPendingKey(null),
    discardAndSwitch,
  }
}

export type UserGroupPricingPanelState = ReturnType<
  typeof useUserGroupPricingPanel
>
