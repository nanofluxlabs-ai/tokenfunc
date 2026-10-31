import { useEffect, useState } from 'react'

import { normalizeDayRange, type DayRange } from '../lib/date-presets'

type SearchLike = Record<string, unknown>

type UseFinanceDateRangeParams = {
  search: SearchLike
  navigate: (opts: {
    search: (prev: SearchLike) => SearchLike
    replace?: boolean
  }) => void
  startKey: string
  endKey: string
  fallback: DayRange
  /** 应用新区间时需要一起清掉的分页键 */
  resetKeys?: string[]
}

/**
 * URL 里的日期范围（已生效）+ 本地草稿（选择器里改但还没点「查询」的值）。
 * applied 永远来自 URL，缺省回退到 fallback，不往 URL 写默认值。
 */
export function useFinanceDateRange(params: UseFinanceDateRangeParams) {
  const applied = normalizeDayRange(
    params.search[params.startKey] as string | undefined,
    params.search[params.endKey] as string | undefined,
    params.fallback
  )
  const [draft, setDraft] = useState<DayRange>(applied)
  useEffect(() => {
    setDraft(applied)
    // 只在 URL 生效值变化时同步草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied.start, applied.end])

  const write = (range: DayRange | null) => {
    params.navigate({
      search: (prev) => {
        const next: SearchLike = { ...prev }
        next[params.startKey] = range?.start
        next[params.endKey] = range?.end
        for (const key of params.resetKeys ?? []) next[key] = undefined
        return next
      },
    })
  }

  return {
    applied,
    draft,
    setDraft,
    /** 快捷档：直接生效，不用再点「查询」 */
    applyRange: (range: DayRange) => {
      setDraft(range)
      write(range)
    },
    /** 草稿不完整时不写入 */
    apply: () => {
      if (draft.start && draft.end && draft.start <= draft.end) write(draft)
    },
    reset: () => {
      setDraft(params.fallback)
      write(null)
    },
  }
}
