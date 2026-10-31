import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type MetricCardProps = {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  loading?: boolean
  className?: string
  /** 标签左侧的图标；不传时与原来一样只显示文字 */
  icon?: LucideIcon
  iconTone?: IconBadgeTone
}

/** 指标卡：标签 + 大号数值 + 可选副行；与企业账单详情页的卡片保持同一视觉 */
export function MetricCard(props: MetricCardProps) {
  const Icon = props.icon
  return (
    <Card className={cn('gap-1 py-4', props.className)}>
      <CardHeader className='px-4'>
        <CardDescription className='flex items-center gap-2'>
          {Icon && (
            <IconBadge tone={props.iconTone ?? 'neutral'} size='sm'>
              <Icon aria-hidden='true' />
            </IconBadge>
          )}
          {props.label}
        </CardDescription>
        <CardTitle className='font-mono text-xl break-all sm:text-2xl'>
          {props.loading ? <Skeleton className='h-7 w-24' /> : props.value}
        </CardTitle>
      </CardHeader>
      {props.hint != null && (
        <CardContent className='text-muted-foreground px-4 text-xs'>
          {props.hint}
        </CardContent>
      )}
    </Card>
  )
}
