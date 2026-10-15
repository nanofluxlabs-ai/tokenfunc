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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { getDocsNav } from '../registry'

/** Grouped docs navigation; marks the active page with aria-current. */
export function DocsNavList(props: {
  activeSlug?: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const groups = getDocsNav()

  return (
    <div className='space-y-6'>
      {groups.map((group) => (
        <div key={group.id}>
          <div className='text-muted-foreground/70 mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase'>
            {t(group.titleKey)}
          </div>
          <ul className='space-y-0.5'>
            {group.pages.map((page) => {
              const isActive = page.slug === props.activeSlug
              return (
                <li key={page.slug}>
                  <Link
                    to='/docs/$slug'
                    params={{ slug: page.slug }}
                    onClick={props.onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-3 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    {t(page.titleKey)}
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
