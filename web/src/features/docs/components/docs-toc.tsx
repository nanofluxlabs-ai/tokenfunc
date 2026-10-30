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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { useActiveHeading } from '../hooks/use-active-heading'
import type { DocHeading } from '../lib/doc-markdown'

/**
 * 本页目录：固定在视口右侧，默认只显示一列细横线（不占正文宽度），
 * 鼠标悬停或键盘聚焦时在原位浮出完整目录，点击标题跳到对应位置。
 * 收起态是一组横线而非单个触发元素，ui/hover-card（PreviewCard）无法承载，故用 CSS group 控制显隐。
 */
export function DocsToc(props: { headings: DocHeading[] }) {
  const { t } = useTranslation()
  const ids = useMemo(
    () => props.headings.map((heading) => heading.id),
    [props.headings]
  )
  const activeId = useActiveHeading(ids)
  if (props.headings.length < 2) return null

  return (
    <nav
      aria-label={t('On this page')}
      className='group fixed top-1/2 right-2 z-40 hidden -translate-y-1/2 lg:block'
    >
      {/* 收起态：每个标题一条横线，当前章节加深加长 */}
      <div
        aria-hidden='true'
        className='flex flex-col items-end gap-2.5 py-3 pr-1 pl-4 transition-opacity group-focus-within:opacity-0 group-hover:opacity-0'
      >
        {props.headings.map((heading) => (
          <span
            key={heading.id}
            data-active={heading.id === activeId || undefined}
            className={cn(
              'bg-muted-foreground/30 block h-0.5 rounded-full transition-all',
              heading.level === 3 ? 'w-2' : 'w-3.5',
              'data-[active]:bg-foreground data-[active]:w-4'
            )}
          />
        ))}
      </div>

      {/* 展开态：覆盖在横线位置上，悬停或聚焦时出现 */}
      <div className='bg-popover text-popover-foreground pointer-events-none absolute top-1/2 right-0 w-64 translate-x-2 -translate-y-1/2 rounded-lg border p-3 opacity-0 shadow-lg transition-all group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100'>
        <div className='text-muted-foreground/70 mb-2 text-[11px] font-semibold tracking-wider uppercase'>
          {t('On this page')}
        </div>
        <ul className='max-h-[70vh] space-y-1 overflow-y-auto text-sm'>
          {props.headings.map((heading) => {
            const active = heading.id === activeId
            return (
              <li
                key={heading.id}
                className={heading.level === 3 ? 'pl-3' : ''}
              >
                <a
                  href={`#${heading.id}`}
                  aria-current={active ? 'location' : undefined}
                  className={cn(
                    'hover:text-foreground block rounded px-1.5 py-1 leading-5 transition-colors',
                    active
                      ? 'text-foreground bg-muted font-medium'
                      : 'text-muted-foreground'
                  )}
                >
                  {heading.text}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
