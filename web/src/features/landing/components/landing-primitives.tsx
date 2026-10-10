import { Check } from 'lucide-react'
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

export function SectionHeading(props: {
  eyebrow: ReactNode
  title: ReactNode
  size?: 'display' | 'title'
  className?: string
}) {
  const size = props.size ?? 'title'
  return (
    <div className={cn('flex flex-col gap-4', props.className)}>
      <Eyebrow>{props.eyebrow}</Eyebrow>
      <h2
        className={cn(
          'text-foreground m-0 font-medium',
          size === 'display'
            ? 'text-[clamp(40px,6vw,72px)] leading-[1.1] tracking-[-0.025em]'
            : 'text-[32px] leading-10 tracking-[-0.6px]'
        )}
      >
        {props.title}
      </h2>
    </div>
  )
}

export function CheckList(props: { items: string[]; className?: string }) {
  if (props.items.length === 0) return null
  return (
    <ul
      className={cn('m-0 flex list-none flex-col gap-2.5 p-0', props.className)}
    >
      {props.items.map((item) => (
        <li
          key={item}
          className='text-foreground/90 flex items-center gap-2.5 text-sm'
        >
          <Check
            className='text-foreground size-3.5 shrink-0'
            aria-hidden='true'
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
      className={props.className}
    >
      <TabsList
        variant='line'
        aria-label={props['aria-label']}
        className='border-border h-auto flex-wrap gap-1 rounded-full border bg-transparent p-1'
      >
        {props.items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className={cn(
              'text-muted-foreground data-active:bg-foreground data-active:text-background hover:text-foreground h-auto flex-none rounded-full border-0 after:hidden',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-[13px]',
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

/** 区块容器：1200 内容宽 + 112px 上下留白 */
export function Section(props: {
  id: string
  children: ReactNode
  className?: string
  innerClassName?: string
  bordered?: boolean
}) {
  return (
    <section
      id={props.id}
      className={cn(
        'scroll-mt-16',
        props.bordered !== false && 'border-border border-t',
        props.className
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-20 md:px-8 md:py-28',
          props.innerClassName
        )}
      >
        {props.children}
      </div>
    </section>
  )
}
