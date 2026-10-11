import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type ShareBarProps = {
  /** 主显示值（已格式化的金额或数字） */
  value: string
  /** 占比 0~100 */
  percentage: number
  tone?: 'primary' | 'muted'
  className?: string
}

/** 占比条：值 + 进度条 + 百分比，分母由调用方决定 */
export function ShareBar(props: ShareBarProps) {
  const clamped = Math.min(100, Math.max(0, props.percentage))
  const percentText =
    clamped > 0 && clamped < 0.1 ? '<0.1%' : `${clamped.toFixed(1)}%`
  return (
    <div
      className={cn(
        'flex min-w-[160px] flex-col items-end gap-1',
        props.className
      )}
    >
      <span className='font-mono text-sm font-medium tabular-nums'>
        {props.value}
      </span>
      <div className='flex w-full items-center gap-2'>
        <Progress
          value={clamped}
          aria-label={percentText}
          className='flex-1'
          trackClassName='h-1.5'
          indicatorClassName={
            props.tone === 'muted' ? 'bg-muted-foreground/60' : undefined
          }
        />
        <span className='text-muted-foreground w-12 text-right text-xs tabular-nums'>
          {percentText}
        </span>
      </div>
    </div>
  )
}
