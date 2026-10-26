import { Calendar as CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveCalendarLocale } from '@/components/calendar-locales'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useMediaQuery } from '@/hooks/use-media-query'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

export type DateRangeValue = { from?: Date; to?: Date }

type DateRangePickerProps = {
  value: DateRangeValue
  onChange: (range: DateRangeValue) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 默认不允许选择未来日期 */
  allowFuture?: boolean
  'aria-label'?: string
}

/**
 * 日期粒度的范围选择器（不含时分）。与 DatePicker 一样用 Popover + Calendar，
 * 区别是 mode='range'，选满起止两端后自动关闭。
 */
export function DateRangePicker(props: DateRangePickerProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  // 两个月并排约 560px，手机上放不下，只显示一个月
  const isMobile = useMediaQuery('(max-width: 640px)')
  const from = props.value.from
  const to = props.value.to
  const hasValue = Boolean(from || to)
  const label = hasValue
    ? `${from ? dayjs(from).format('YYYY-MM-DD') : '…'} ~ ${to ? dayjs(to).format('YYYY-MM-DD') : '…'}`
    : (props.placeholder ?? t('Date Range'))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant='outline'
            disabled={props.disabled}
            data-empty={!hasValue}
            aria-label={props['aria-label'] ?? t('Date Range')}
            className={cn(
              'data-[empty=true]:text-muted-foreground justify-start text-start font-normal',
              props.className
            )}
          />
        }
      >
        <CalendarIcon className='h-4 w-4 opacity-50' />
        <span className='truncate'>{label}</span>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='end'>
        <Calendar
          mode='range'
          captionLayout='dropdown'
          numberOfMonths={isMobile ? 1 : 2}
          selected={{ from, to }}
          defaultMonth={from}
          onSelect={(range) => {
            props.onChange({ from: range?.from, to: range?.to })
            if (range?.from && range?.to) setOpen(false)
          }}
          locale={resolveCalendarLocale(i18n.language)}
          disabled={(date: Date) =>
            (!props.allowFuture && date > new Date()) ||
            date < new Date('1900-01-01')
          }
        />
      </PopoverContent>
    </Popover>
  )
}
