import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

export type BillNotice = {
  key: string
  text: string
  /** 需要用户留意的说明（账期未结束、日志已清理等）用警示色 */
  warning?: boolean
}

function NoticeAlert(props: { notice: BillNotice }) {
  return (
    <Alert
      className={cn(props.notice.warning && 'border-warning/40 bg-warning/10')}
    >
      <AlertDescription>{props.notice.text}</AlertDescription>
    </Alert>
  )
}

/**
 * 账单详情顶部的数据来源说明：桌面全部列出；手机只显示第一条，其余收进「另有 N 条说明」，
 * 避免首屏被提示条占满、看不到金额。
 */
export function BillNotices(props: { notices: BillNotice[] }) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [open, setOpen] = useState(false)
  const [first, ...rest] = props.notices

  if (!first) return null
  if (!isMobile || rest.length === 0) {
    return props.notices.map((notice) => (
      <NoticeAlert key={notice.key} notice={notice} />
    ))
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className='flex flex-col gap-2'
    >
      <NoticeAlert notice={first} />
      <CollapsibleContent className='flex flex-col gap-2'>
        {rest.map((notice) => (
          <NoticeAlert key={notice.key} notice={notice} />
        ))}
      </CollapsibleContent>
      <CollapsibleTrigger
        render={
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground self-start'
          />
        }
      >
        {open
          ? t('Hide notes')
          : t('{{count}} more notes', { count: rest.length })}
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden='true'
        />
      </CollapsibleTrigger>
    </Collapsible>
  )
}
