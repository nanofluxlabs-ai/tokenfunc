// TokenFunc 二开：某个用户分组的渠道分组定价——查询、本地草稿与保存。
// 定价抽屉与系统设置的定价面板共用，两边只负责布局与按钮。
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import {
  getUserGroupPricing,
  saveUserGroupPricing,
  tokenFuncGroupQueryKeys,
  type UserGroupPricingInput,
} from '@/lib/tokenfunc-groups'

import {
  isRatioInvalid,
  parseRatioText,
  toPricingRowViews,
  type PricingRowView,
} from '../lib/user-group-pricing'

/** 草稿绑定它所基于的服务端快照；快照一换（切分组、保存后刷新）草稿自动作废 */
type PricingDraft = { base: PricingRowView[]; rows: PricingRowView[] }

export function useUserGroupPricing(
  groupKey: string,
  options?: { enabled?: boolean }
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<PricingDraft | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const query = useQuery({
    queryKey: tokenFuncGroupQueryKeys.userPricing(groupKey),
    queryFn: async () =>
      requireServerSuccess(await getUserGroupPricing(groupKey)),
    enabled: (options?.enabled ?? true) && groupKey !== '',
  })

  const base = useMemo(
    () => toPricingRowViews(query.data?.data ?? []),
    [query.data]
  )
  const rows = draft?.base === base ? draft.rows : base
  // 顺序也是数据：可见行的先后就是用户在令牌下拉里看到的顺序，位置变了同样算改动
  const isDirty =
    rows !== base &&
    rows.some((row, index) => {
      const origin = base[index]
      return (
        origin === undefined ||
        origin.channel_group !== row.channel_group ||
        origin.visible !== row.visible ||
        origin.ratioText !== row.ratioText
      )
    })

  const isValid = !rows.some(isRatioInvalid)

  const setRows = (next: PricingRowView[]) => setDraft({ base, rows: next })
  const reset = () => setDraft(null)

  /** 当前表的全部行（可见行按当前顺序在前，后端据此存顺序） */
  const toInputs = (): UserGroupPricingInput[] =>
    rows.map((row) => ({
      channel_group: row.channel_group,
      visible: row.visible,
      ratio: row.visible ? parseRatioText(row.ratioText) : null,
    }))

  /** 单独提交这一个用户分组的定价表（用户管理页的定价抽屉）；成功返回 true */
  const save = async (): Promise<boolean> => {
    if (groupKey === '') return false
    if (!isValid) {
      toast.error(t('Ratio must be a number of 0 or more'))
      return false
    }
    const payload = toInputs()
    setIsSaving(true)
    try {
      const result = await saveUserGroupPricing(groupKey, payload)
      if (!result.success) {
        handleServerError(result)
        return false
      }
      toast.success(t('Pricing saved'))
      // 用返回的行当作新快照，草稿随之作废；注册表的 override_count 也变了
      queryClient.setQueryData(
        tokenFuncGroupQueryKeys.userPricing(groupKey),
        result
      )
      setDraft(null)
      void queryClient.invalidateQueries({
        queryKey: tokenFuncGroupQueryKeys.user,
      })
      void queryClient.invalidateQueries({
        queryKey: tokenFuncGroupQueryKeys.userPricing(groupKey),
      })
      return true
    } catch (error) {
      handleServerError(error)
      return false
    } finally {
      setIsSaving(false)
    }
  }

  return {
    rows,
    setRows,
    reset,
    isDirty,
    isValid,
    toInputs,
    isLoading: query.isLoading,
    isSaving,
    save,
  }
}
