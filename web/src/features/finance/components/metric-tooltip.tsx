import type { ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type MetricTooltipItem = { label: string; value: ReactNode }

type MetricTooltipProps = {
  items: MetricTooltipItem[]
  children: ReactNode
  /** 明细前的提示文案 */
  note?: string
}

/** 悬浮展示一组「标签: 值」明细；触发区用虚线下划线提示可悬浮 */
export function MetricTooltip(props: MetricTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className='decoration-muted-foreground/60 inline-flex cursor-help flex-col items-end underline decoration-dashed underline-offset-4' />
          }
        >
          {props.children}
        </TooltipTrigger>
        <TooltipContent className='max-w-sm' side='left'>
          <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs'>
            {props.note && (
              <p className='col-span-2 mb-1 opacity-80'>{props.note}</p>
            )}
            {props.items.map((item) => (
              <div key={item.label} className='contents'>
                <dt className='opacity-80'>{item.label}</dt>
                <dd className='text-right font-mono tabular-nums'>
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
