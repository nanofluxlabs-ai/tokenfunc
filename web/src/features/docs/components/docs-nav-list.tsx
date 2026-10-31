/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  Building2,
  ChevronRight,
  Code,
  KeyRound,
  LayoutGrid,
  Puzzle,
  Rocket,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useEffect } from 'react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'
import { useDocsNavStore } from '@/stores/docs-nav-store'

import { docsLangSearch } from '../lib/docs-links'
import {
  getDocsEntry,
  getDocsNav,
  type DocsGroupId,
  type DocsLang,
} from '../registry'
import { MethodBadge } from './method-badge'

// 分组图标放在组件里而不是 registry：registry 要给构建期预渲染用，不能引入 React 组件
const GROUP_ICONS: Record<DocsGroupId, LucideIcon> = {
  'getting-started': Rocket,
  api: Code,
  enterprise: Building2,
  tools: Puzzle,
}

// API 组里不是接口的说明页（鉴权、错误码）在请求方法那一列放图标，标题与接口页对齐
const GUIDE_ICONS: Record<string, LucideIcon> = {
  'api-authentication': KeyRound,
  'api-errors': TriangleAlert,
}

function GroupIcon(props: { id: DocsGroupId }) {
  const Icon = GROUP_ICONS[props.id]
  return (
    <Icon
      data-slot='docs-nav-group-icon'
      className='size-3.5 shrink-0'
      aria-hidden='true'
    />
  )
}

/** 分组侧栏，分组可折叠；当前页带 aria-current，所在分组被折叠时自动展开 */
export function DocsNavList(props: {
  lang: DocsLang
  activeSlug?: string
  onNavigate?: () => void
}) {
  const groups = getDocsNav()
  const collapsed = useDocsNavStore((state) => state.collapsed)
  const setGroupOpen = useDocsNavStore((state) => state.setGroupOpen)
  const activeGroup = props.activeSlug
    ? getDocsEntry(props.activeSlug).group
    : undefined

  useEffect(() => {
    if (activeGroup) setGroupOpen(activeGroup, true)
  }, [activeGroup, setGroupOpen])

  return (
    <div className='space-y-4'>
      {groups.map((group) => (
        <Collapsible
          key={group.id}
          open={!collapsed.includes(group.id)}
          onOpenChange={(open) => setGroupOpen(group.id, open)}
        >
          <CollapsibleTrigger className='group/docs-nav text-muted-foreground/70 hover:text-foreground flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-colors'>
            <span className='flex items-center gap-2'>
              <GroupIcon id={group.id} />
              {group.title[props.lang]}
            </span>
            <ChevronRight
              className='size-3.5 transition-transform group-data-[panel-open]/docs-nav:rotate-90'
              aria-hidden='true'
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className='mt-1 space-y-0.5'>
              {group.pages.map((page) => {
                // 组内有页面带图标 / 请求方法时，整组都留出同宽的位置，保持文字对齐
                const groupHasIcons = group.pages.some((item) => item.icon)
                const groupHasMethods = group.pages.some((item) => item.method)
                const GuideIcon = GUIDE_ICONS[page.slug] ?? BookOpen
                const isActive = page.slug === props.activeSlug
                return (
                  <li key={page.slug}>
                    <Link
                      to='/docs/$slug'
                      params={{ slug: page.slug }}
                      search={docsLangSearch(props.lang)}
                      onClick={props.onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors lg:py-1.5',
                        isActive
                          ? 'bg-muted text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      {page.method && (
                        <MethodBadge method={page.method} size='sm' />
                      )}
                      {!page.method && groupHasMethods && (
                        <span
                          data-slot='docs-nav-method-icon'
                          aria-hidden='true'
                          className='flex h-4 w-9 shrink-0 items-center justify-center'
                        >
                          <GuideIcon className='size-3.5' />
                        </span>
                      )}
                      {groupHasIcons && (
                        <span
                          data-slot='docs-nav-icon'
                          aria-hidden='true'
                          className='flex size-4 shrink-0 items-center justify-center'
                        >
                          {page.icon ? (
                            getLobeIcon(page.icon, 16)
                          ) : (
                            <LayoutGrid className='size-4' />
                          )}
                        </span>
                      )}
                      <span className='min-w-0'>{page.title[props.lang]}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  )
}
