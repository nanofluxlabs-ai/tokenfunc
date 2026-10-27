import { TrendingDown, TrendingUp } from 'lucide-react'

import { changePercent } from '@/lib/change-percent'

/** 环比徽标：上期为 0 时不显示；涨跌只表示方向，不代表好坏，统一用中性色 */
export function ChangePill(props: {
  current: number
  previous: number
  label: string
}) {
  const delta = changePercent(props.current, props.previous)
  if (delta === null) return null
  const Icon = delta >= 0 ? TrendingUp : TrendingDown
  const sign = delta >= 0 ? '+' : ''
  return (
    <span
      className='bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums'
      title={props.label}
    >
      <Icon className='size-3' aria-hidden='true' />
      {`${sign}${delta}%`}
      <span className='sr-only'>{props.label}</span>
    </span>
  )
}
