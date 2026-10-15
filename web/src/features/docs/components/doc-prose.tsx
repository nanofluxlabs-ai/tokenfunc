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
import type { ReactNode } from 'react'

/** Body paragraph for docs pages. */
export function P(props: { children: ReactNode }) {
  return (
    <p className='text-muted-foreground mt-4 text-sm leading-7 first:mt-0'>
      {props.children}
    </p>
  )
}

/** Inline code token inside prose. */
export function C(props: { children: ReactNode }) {
  return (
    <code className='bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[13px]'>
      {props.children}
    </code>
  )
}

/** Callout box for caveats and tips. */
export function Note(props: { children: ReactNode }) {
  return (
    <div className='border-border/60 bg-muted/20 mt-4 rounded-lg border p-3.5 text-sm leading-6'>
      {props.children}
    </div>
  )
}

/** Numbered steps used by the tool integration pages. */
export function DocSteps(props: {
  items: { title: string; children?: ReactNode }[]
}) {
  return (
    <ol className='mt-5 space-y-6'>
      {props.items.map((item, index) => (
        <li key={item.title} className='flex gap-3.5'>
          <span className='bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
            {index + 1}
          </span>
          <div className='min-w-0 flex-1'>
            <div className='text-foreground text-sm font-medium'>
              {item.title}
            </div>
            {item.children && <div className='mt-2'>{item.children}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}
