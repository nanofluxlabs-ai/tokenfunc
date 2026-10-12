import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** 带标题的无内边距卡片，里面放一张表；用量明细三块与个人财务对账共用 */
export function SectionBlock(props: { title: string; children: ReactNode }) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b px-4 py-3'>
        <CardTitle className='text-base'>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className='p-0'>{props.children}</CardContent>
    </Card>
  )
}
