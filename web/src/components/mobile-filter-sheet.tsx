import { SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'

type MobileFilterSheetProps = {
  /** 筛选控件；桌面原样内联渲染，手机收进底部抽屉纵向铺满 */
  children: ReactNode
  /** 手机触发按钮的文字，缺省「筛选」；日期栏可传当前区间 */
  label?: ReactNode
  /** 已生效的筛选数，大于 0 时显示在按钮上 */
  activeCount?: number
}

/**
 * 手机上把常驻的筛选 / 日期控件收成一个按钮，点开从底部弹出。
 *
 * 上游 DataTableMobileFilterPanel 默认展开且只服务数据表工具栏，接不了日期区间，
 * 收不起来就解决不了筛选常驻占屏，所以用上游 Sheet 原语单独组合。
 */
export function MobileFilterSheet(props: MobileFilterSheetProps) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')

  if (!isMobile) return props.children

  const activeCount = props.activeCount ?? 0
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant='outline'
            size='sm'
            className='h-9 max-w-full gap-2'
          />
        }
      >
        <SlidersHorizontal className='size-4 shrink-0' aria-hidden='true' />
        <span className='truncate'>{props.label ?? t('Filter')}</span>
        {activeCount > 0 && (
          <Badge className='h-5 min-w-5 rounded-full px-1.5 tabular-nums'>
            {activeCount}
          </Badge>
        )}
      </SheetTrigger>
      <SheetContent side='bottom' className='max-h-[85svh] overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>{t('Filter')}</SheetTitle>
        </SheetHeader>
        <div className='flex flex-col gap-3 px-4'>{props.children}</div>
        <SheetFooter>
          <SheetClose render={<Button className='w-full' />}>
            {t('Done')}
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
