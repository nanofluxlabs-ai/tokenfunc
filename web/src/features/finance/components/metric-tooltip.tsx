import type { ReactNode } from 'react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/use-media-query'

export type MetricTooltipItem = { label: string; value: ReactNode }

type MetricTooltipProps = {
  items: MetricTooltipItem[]
  children: ReactNode
  /** 明细前的提示文案 */
  note?: string
}

const TRIGGER_CLASS =
  'decoration-muted-foreground/60 inline-flex cursor-help flex-col items-end underline decoration-dashed underline-offset-4'

function MetricDetails(props: Pick<MetricTooltipProps, 'items' | 'note'>) {
  return (
    <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs'>
      {props.note && <p className='col-span-2 mb-1 opacity-80'>{props.note}</p>}
      {props.items.map((item) => (
        <div key={item.label} className='contents'>
          <dt className='opacity-80'>{item.label}</dt>
          <dd className='text-right font-mono tabular-nums'>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * 展示一组「标签: 值」明细；触发区用虚线下划线提示可展开。
 * 有鼠标时悬浮显示；触屏没有悬停，改为点按弹出（Popover），否则明细在手机上看不到。
 */
export function MetricTooltip(props: MetricTooltipProps) {
  const touch = useMediaQuery('(hover: none)')

  if (touch) {
    return (
      <Popover>
        <PopoverTrigger
          render={<button type='button' className={TRIGGER_CLASS} />}
        >
          {props.children}
        </PopoverTrigger>
        <PopoverContent className='w-auto max-w-[min(24rem,90vw)] p-3'>
          <MetricDetails items={props.items} note={props.note} />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className={TRIGGER_CLASS} />}>
          {props.children}
        </TooltipTrigger>
        <TooltipContent className='max-w-sm' side='left'>
          <MetricDetails items={props.items} note={props.note} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
