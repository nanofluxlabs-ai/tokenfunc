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

import { cn } from '@/lib/utils'

import { docsLangSearch } from '../lib/docs-links'
import { getDocsNav, type DocsLang } from '../registry'

/** 分组侧栏，标题跟随正文语言；当前页带 aria-current */
export function DocsNavList(props: {
  lang: DocsLang
  activeSlug?: string
  onNavigate?: () => void
}) {
  const groups = getDocsNav()

  return (
    <div className='space-y-6'>
      {groups.map((group) => (
        <div key={group.id}>
          <div className='text-muted-foreground/70 mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase'>
            {group.title[props.lang]}
          </div>
          <ul className='space-y-0.5'>
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
        </div>
      ))}
    </div>
  )
}
