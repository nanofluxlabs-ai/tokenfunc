import type { ReactNode } from 'react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

/** 等宽小写标签：各区块左上角的 "WHY TOKENFUNC" 之类 */
export function Eyebrow(props: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'text-muted-foreground font-mono text-xs leading-[18px] tracking-[1.2px] uppercase',
        props.className
      )}
    >
      {props.children}
    </span>
  )
}

/** 要点列表：6px 品牌绿圆点 + 15px 文字 */
export function DotList(props: { items: string[]; className?: string }) {
  if (props.items.length === 0) return null
  return (
    <ul
      className={cn('m-0 flex list-none flex-col gap-3 p-0', props.className)}
    >
      {props.items.map((item) => (
        <li
          key={item}
          className='text-foreground/90 flex items-center gap-3 text-[15px]'
        >
          <span
            aria-hidden='true'
            className='bg-primary size-1.5 flex-none rounded-full'
          />
          {item}
        </li>
      ))}
    </ul>
  )
}

/** 卡片表面：深色 #181818 一类的面板，浅色下退化为 card 色 */
export function Panel(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'bg-card border-border overflow-hidden rounded-xl border',
        props.className
      )}
    >
      {props.children}
    </div>
  )
}

/** 胶囊分段控件：基于 Tabs 原语，保证键盘与读屏可用 */
export function PillTabs<T extends string>(props: {
  value: T
  onValueChange: (value: T) => void
  items: { value: T; label: ReactNode }[]
  size?: 'sm' | 'md'
  mono?: boolean
  'aria-label': string
  className?: string
}) {
  const size = props.size ?? 'md'
  return (
    <Tabs
      value={props.value}
      onValueChange={(value) => props.onValueChange(value as T)}
      // 限住宽度，手机上按钮组才会在自身内横滑而不是把卡片撑宽
      className={cn('max-w-full min-w-0', props.className)}
    >
      <TabsList
        aria-label={props['aria-label']}
        className='border-border h-auto max-w-full [scrollbar-width:none] flex-nowrap gap-1 overflow-x-auto rounded-full border bg-transparent p-1 group-data-horizontal/tabs:h-auto [&::-webkit-scrollbar]:hidden'
      >
        {props.items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className={cn(
              // 选中态用前景色做底、背景色做字：明暗两套主题都能保证对比度
              'text-muted-foreground hover:text-foreground h-auto flex-none rounded-full border-0 whitespace-nowrap after:hidden',
              'data-active:bg-foreground data-active:text-background data-active:shadow-none',
              'dark:data-active:border-transparent dark:data-active:bg-foreground dark:data-active:text-background',
              size === 'sm'
                ? 'h-7 px-3.5 text-[13px]'
                : 'px-4 py-1.5 text-[13px]',
              props.mono && 'font-mono'
            )}
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
