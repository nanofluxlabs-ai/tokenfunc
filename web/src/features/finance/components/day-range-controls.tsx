import { useTranslation } from 'react-i18next'

import { DateRangePicker } from '@/components/date-range-picker'
import { Button } from '@/components/ui/button'

import { formatDay, parseDay, type DayRange } from '../lib/date-presets'

type DayRangeControlsProps = {
  draft: DayRange
  onDraftChange: (range: DayRange) => void
  onApply: () => void
  onReset: () => void
  applyLabel?: string
  resetLabel?: string
  disabled?: boolean
  className?: string
}

/** 日期范围选择器 + 查询 / 重置；财务中心各 tab 与详情页共用 */
export function DayRangeControls(props: DayRangeControlsProps) {
  const { t } = useTranslation()
  const incomplete =
    !props.draft.start ||
    !props.draft.end ||
    props.draft.start > props.draft.end
  return (
    <div className={props.className ?? 'flex flex-wrap items-center gap-2'}>
      <DateRangePicker
        value={{
          from: parseDay(props.draft.start),
          to: parseDay(props.draft.end),
        }}
        onChange={(range) =>
          props.onDraftChange({
            start: range.from ? formatDay(range.from) : '',
            end: range.to ? formatDay(range.to) : '',
          })
        }
        disabled={props.disabled}
        className='min-w-[240px]'
      />
      <Button
        size='sm'
        onClick={props.onApply}
        disabled={props.disabled || incomplete}
      >
        {props.applyLabel ?? t('Query')}
      </Button>
      <Button
        size='sm'
        variant='outline'
        onClick={props.onReset}
        disabled={props.disabled}
      >
        {props.resetLabel ?? t('Reset')}
      </Button>
    </div>
  )
}
