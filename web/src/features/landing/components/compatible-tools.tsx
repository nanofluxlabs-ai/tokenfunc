import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { COMPATIBLE_TOOLS, type CompatibleTool } from '../content'

/** 名称首字母（最多两个），没有官方 logo 时作圆角占位 */
function toolInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}

function ToolLogo(props: { tool: CompatibleTool }) {
  const tool = props.tool
  if (!tool.logo) {
    return (
      <span
        aria-hidden='true'
        className='bg-muted text-foreground flex size-7 flex-none items-center justify-center rounded-[7px] text-[11px] font-semibold'
      >
        {toolInitials(tool.name)}
      </span>
    )
  }
  return (
    <span aria-hidden='true' className='flex size-7 flex-none items-center'>
      <img
        src={tool.logo}
        alt=''
        width={28}
        height={28}
        loading='lazy'
        className={cn('size-7 object-contain', tool.logoDark && 'dark:hidden')}
      />
      {tool.logoDark && (
        <img
          src={tool.logoDark}
          alt=''
          width={28}
          height={28}
          loading='lazy'
          className='hidden size-7 object-contain dark:block'
        />
      )}
    </span>
  )
}

function ToolList(props: { duplicate: boolean }) {
  const { t } = useTranslation()
  return (
    <ul
      className={cn(
        'm-0 flex list-none p-0',
        props.duplicate && 'tf-marquee-dup'
      )}
      aria-hidden={props.duplicate || undefined}
    >
      {COMPATIBLE_TOOLS.map((tool) => (
        <li key={tool.id} className='flex-none'>
          <Link
            to='/docs/$slug'
            params={{ slug: tool.docSlug }}
            tabIndex={props.duplicate ? -1 : undefined}
            className='text-muted-foreground hover:text-foreground flex h-14 items-center gap-2.5 px-[26px] text-sm whitespace-nowrap transition-colors'
          >
            <ToolLogo tool={tool} />
            {tool.nameKey ? t(tool.nameKey) : tool.name}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Hero 下方的兼容工具滚动条：列表渲染两遍，轨道平移 -50% 实现无缝循环。
 * 第二遍对读屏与 Tab 键隐藏；悬停暂停；减弱动效下停止滚动、改为手动横滑。
 */
export function CompatibleTools() {
  const { t } = useTranslation()
  return (
    <div
      role='region'
      aria-label={t('Compatible tools')}
      className='tf-marquee mt-9 w-full max-w-[1040px]'
    >
      <div className='tf-marquee-track flex w-max'>
        <ToolList duplicate={false} />
        <ToolList duplicate />
      </div>
    </div>
  )
}
