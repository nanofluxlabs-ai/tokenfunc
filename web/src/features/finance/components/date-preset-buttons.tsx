import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { DatePresetId } from '../lib/date-presets'

const PRESET_LABEL_KEYS: Record<DatePresetId, string> = {
  today: 'Today',
  month: 'Current month',
  lastMonth: 'Last month',
  last30: 'Last 30 days',
}

type DatePresetButtonsProps = {
  presets: DatePresetId[]
  onSelect: (preset: DatePresetId) => void
  disabled?: boolean
}

/** 日期快捷区间按钮组；用户消耗详情页与个人财务对账共用 */
export function DatePresetButtons(props: DatePresetButtonsProps) {
  const { t } = useTranslation()
  return (
    <>
      {props.presets.map((preset) => (
        <Button
          key={preset}
          variant='outline'
          size='sm'
          disabled={props.disabled}
          onClick={() => props.onSelect(preset)}
        >
          {t(PRESET_LABEL_KEYS[preset])}
        </Button>
      ))}
    </>
  )
}
