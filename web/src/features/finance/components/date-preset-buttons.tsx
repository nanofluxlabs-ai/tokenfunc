import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  matchDatePreset,
  type DatePresetId,
  type DayRange,
} from '../lib/date-presets'

const PRESET_LABEL_KEYS: Record<DatePresetId, string> = {
  today: 'Today',
  week: 'This week',
  month: 'Current month',
  lastMonth: 'Last month',
  last30: 'Last 30 days',
}

type DatePresetButtonsProps = {
  presets: DatePresetId[]
  onSelect: (preset: DatePresetId) => void
  /** 已生效的区间；与某个快捷档吻合时高亮该档 */
  range: DayRange
  disabled?: boolean
}

/** 日期快捷区间按钮组（计费时区）；财务中心页头、用户消耗详情、对账、推广中心共用 */
export function DatePresetButtons(props: DatePresetButtonsProps) {
  const { t } = useTranslation()
  // 记住刚点的档：区间相同的几档（如周一的「今天」与「本周」）里高亮用户点的那个
  const [picked, setPicked] = useState<DatePresetId | null>(null)
  const active = matchDatePreset(props.range, props.presets, picked)
  return (
    <>
      {props.presets.map((preset) => (
        <Button
          key={preset}
          variant='outline'
          size='sm'
          // 选中态用品牌色描边 + 浅底，与实心的「查询」按钮区分；secondary 在暗色下和 outline 几乎看不出差别
          className={cn(
            active === preset &&
              'border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:border-primary dark:bg-primary/15'
          )}
          aria-pressed={active === preset}
          disabled={props.disabled}
          onClick={() => {
            setPicked(preset)
            props.onSelect(preset)
          }}
        >
          {t(PRESET_LABEL_KEYS[preset])}
        </Button>
      ))}
    </>
  )
}
