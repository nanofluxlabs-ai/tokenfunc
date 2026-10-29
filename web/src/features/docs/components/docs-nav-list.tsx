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
import { ChevronRight } from 'lucide-react'
import { useEffect } from 'react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useDocsNavStore } from '@/stores/docs-nav-store'

import { docsLangSearch } from '../lib/docs-links'
import { getDocsEntry, getDocsNav, type DocsLang } from '../registry'

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
            {group.title[props.lang]}
            <ChevronRight
              className='size-3.5 transition-transform group-data-[panel-open]/docs-nav:rotate-90'
              aria-hidden='true'
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className='mt-1 space-y-0.5'>
              {group.pages.map((page) => {
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
                        'block rounded-md px-3 py-2.5 text-sm transition-colors lg:py-1.5',
                        isActive
                          ? 'bg-muted text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      {page.title[props.lang]}
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
