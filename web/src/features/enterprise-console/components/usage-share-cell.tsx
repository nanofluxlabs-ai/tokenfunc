import { Progress } from '@/components/ui/progress'

import { sharePercent } from '../lib/usage-range'

/** 占比单元格：进度条 + 百分比 */
export function UsageShareCell(props: { value: number; total: number }) {
  const percent = sharePercent(props.value, props.total)
  return (
    <div className='flex min-w-28 items-center gap-2'>
      <Progress value={percent} className='flex-1' aria-hidden='true' />
      <span className='text-muted-foreground w-12 text-right text-xs tabular-nums'>
        {percent}%
      </span>
    </div>
  )
}
