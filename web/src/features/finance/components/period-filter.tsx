import type { ReactNode } from 'react'

import { MobileFilterSheet } from '@/components/mobile-filter-sheet'

import type { useFinanceDateRange } from '../hooks/use-finance-date-range'
import type { DatePresetId } from '../lib/date-presets'
import { DatePresetButtons } from './date-preset-buttons'
import { DayRangeControls } from './day-range-controls'

type PeriodFilterProps = {
  range: ReturnType<typeof useFinanceDateRange>
  presets: DatePresetId[]
  onPreset: (preset: DatePresetId) => void
  disabled?: boolean
  /** 区间选择器与「查询」之间的额外筛选；带额外筛选时用 onApply / onReset 一并提交与清空 */
  children?: ReactNode
  onApply?: () => void
  onReset?: () => void
}

/**
 * 账期筛选（快捷档 + 区间 + 查询 / 重置）：桌面原样排成一行，
 * 手机收成一个显示已生效区间的按钮，点开在底部抽屉里选。
 * 财务中心页头、企业对账、个人对账、推广中心共用。
 */
export function PeriodFilter(props: PeriodFilterProps) {
  return (
    <MobileFilterSheet
      label={`${props.range.applied.start} ~ ${props.range.applied.end}`}
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2'>
        <DatePresetButtons
          presets={props.presets}
          onSelect={props.onPreset}
          range={props.range.applied}
          disabled={props.disabled}
        />
        <DayRangeControls
          draft={props.range.draft}
          onDraftChange={props.range.setDraft}
          onApply={props.onApply ?? props.range.apply}
          onReset={props.onReset ?? props.range.reset}
          disabled={props.disabled}
        >
          {props.children}
        </DayRangeControls>
      </div>
    </MobileFilterSheet>
  )
}
